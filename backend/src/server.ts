// backend/src/server.ts
import app from './app'; // importa o app com todas as rotas e middlewares

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
