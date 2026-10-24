// Deliberately do not display/log raw provider messages, which may include URLs
// or personal data. Additional password policies are enforced by Supabase.
export function authErrorMessage(error: unknown, context: 'auth' | 'confirmation' = 'auth'): string {
  const details = error && typeof error === 'object' ? error as { code?: string; status?: number; name?: string; reasons?: string[] } : {}
  if (details.code === 'invalid_credentials') return 'El correo o la contraseña son incorrectos.'
  if (details.code === 'email_not_confirmed') return 'Tu correo todavía no está confirmado. Revisá el mensaje de confirmación antes de ingresar.'
  if (details.code === 'over_email_send_rate_limit') return 'Se alcanzó el límite de envío de correos. Esperá un momento antes de volver a intentar.'
  if (details.status === 429 || ['over_request_rate_limit', 'over_sms_send_rate_limit'].includes(details.code ?? '')) return 'Hubo demasiados intentos. Esperá unos minutos y volvé a intentar.'
  if (details.code === 'email_address_not_authorized') return 'Por el momento no podemos enviar la confirmación a ese correo. Intentá más tarde; no podemos confirmar que el mensaje se haya enviado.'
  if (details.code === 'weak_password') {
    if (details.reasons?.includes('pwned')) return 'La contraseña aparece en filtraciones conocidas. Elegí una diferente.'
    return 'La contraseña no cumple los requisitos de seguridad. Usá al menos 8 caracteres y una combinación de letras, números y símbolos.'
  }
  if (['email_address_invalid', 'validation_failed'].includes(details.code ?? '') && context !== 'confirmation') return 'Revisá el correo y los datos ingresados.'
  if (details.code === 'signup_disabled' || details.code === 'email_provider_disabled') return 'El registro con correo no está disponible por el momento. Intentá más tarde.'
  if (details.code === 'user_already_exists' || details.code === 'email_exists') return 'No se pudo completar el registro con esos datos. Si ya tenés una cuenta, intentá ingresar.'
  if (details.code === 'captcha_failed') return 'No pudimos completar la verificación de seguridad. Intentá nuevamente más tarde.'
  if (details.name === 'AuthRetryableFetchError' || error instanceof TypeError || details.status === 0) return 'No pudimos conectarnos. Revisá tu conexión y volvé a intentar.'
  if (context === 'confirmation') {
    if (['otp_expired', 'flow_state_expired'].includes(details.code ?? '')) return 'El enlace de confirmación venció o ya fue utilizado. Si ya confirmaste tu correo, intentá ingresar.'
    return 'No pudimos completar la confirmación. Abrí el enlace en el mismo navegador donde te registraste, o intentá ingresar si ya confirmaste tu correo.'
  }
  return 'No se pudo completar la operación. Intentá nuevamente en unos minutos.'
}
