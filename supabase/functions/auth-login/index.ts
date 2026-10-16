// Edge Function: auth-login
// Ticket 4: Autenticación SAP + PIN con generación de JWT firmado

import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { SignJWT } from "npm:jose@5.9.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Manejo de preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método no permitido. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { sap, pin } = body;

    if (!sap || String(sap).trim() === "") {
      return new Response(
        JSON.stringify({ error: "El número SAP es requerido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const jwtSecret = Deno.env.get("JWT_SECRET") ?? Deno.env.get("SUPABASE_AUTH_JWT_SECRET") ?? "super-secret-jwt-token-with-at-least-32-characters-long";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Llamar a la función de PostgreSQL verificar_pin
    const { data, error } = await supabase.rpc("verificar_pin", {
      p_sap: String(sap).trim(),
      p_pin: pin ? String(pin).trim() : null,
    });

    if (error) {
      const errorMessage = error.message || "";

      // Si la cuenta está bloqueada, dar mensaje informativo sin revelar más detalles
      if (errorMessage.includes("CUENTA_BLOQUEADA")) {
        return new Response(
          JSON.stringify({
            error: "Tu cuenta está bloqueada tras 3 intentos fallidos. Contacta a RH o al administrador.",
            bloqueado: true,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mensaje genérico 401 para credenciales inválidas o PIN incorrecto (no revelar si el SAP existe)
      return new Response(
        JSON.stringify({ error: "Número SAP o PIN incorrecto." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Caso: Primer acceso con PIN pendiente de creación
    if (data.pin_pendiente === true) {
      return new Response(
        JSON.stringify({
          pin_pendiente: true,
          message: "Primer acceso detectado. Se requiere crear PIN de 4 dígitos.",
          user: {
            id: data.usuario_id,
            sap: data.sap,
            nombre: data.nombre,
            rol: data.rol,
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generar JWT firmado con sub, rol y sap
    const secretKey = new TextEncoder().encode(jwtSecret);
    const token = await new SignJWT({
      sub: data.usuario_id,
      rol: data.rol,
      sap: data.sap,
      nombre: data.nombre,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(secretKey);

    return new Response(
      JSON.stringify({
        token,
        user: {
          id: data.usuario_id,
          sap: data.sap,
          nombre: data.nombre,
          rol: data.rol,
          pin_pendiente: false,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Error interno del servidor de autenticación." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
