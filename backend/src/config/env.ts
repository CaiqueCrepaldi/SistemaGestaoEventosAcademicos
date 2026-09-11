import "dotenv/config";

// le uma variavel de ambiente obrigatoria, derruba o servidor se nao tiver
function obrigatoria(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome} (veja .env.example)`);
  }
  return valor;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? 8080),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",

  databaseUrl: obrigatoria("DATABASE_URL"),

  jwtSecret: obrigatoria("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",

  resend: {
    apiKey: process.env.RESEND_API_KEY || null,
    // sem dominio proprio verificado no Resend, o remetente tem que ser esse (so funciona pra teste)
    from: process.env.EMAIL_FROM ?? "Gestão de Eventos Acadêmicos <onboarding@resend.dev>",
  },
};
