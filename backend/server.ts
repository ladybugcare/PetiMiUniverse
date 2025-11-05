// backend/server.ts
import app from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 PetiVet backend rodando na porta ${PORT}`);
});
