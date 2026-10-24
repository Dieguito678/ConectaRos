export type AuthMode = 'login' | 'signup'
export interface AuthFields { displayName: string; email: string; password: string; repeatPassword: string }
export type FieldErrors = Partial<Record<keyof AuthFields, string>>

export function validateAuthFields(mode: AuthMode, fields: AuthFields): FieldErrors {
  const errors: FieldErrors = {}
  const name = fields.displayName.trim()
  if (mode === 'signup' && (Array.from(name).length < 1 || Array.from(name).length > 80 || /\p{Cc}/u.test(name))) {
    errors.displayName = 'Ingresá un nombre de 1 a 80 caracteres, sin saltos de línea.'
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim()) || fields.email.trim().length > 254) {
    errors.email = 'Ingresá un correo válido.'
  }
  if (!fields.password) errors.password = 'Ingresá tu contraseña.'
  else if (mode === 'signup' && Array.from(fields.password).length < 8) errors.password = 'Usá al menos 8 caracteres.'
  if (mode === 'signup' && fields.password !== fields.repeatPassword) errors.repeatPassword = 'Las contraseñas no coinciden.'
  return errors
}
