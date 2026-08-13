import 'dotenv/config';
import express from 'express';
import path from 'path';
import { buscarConfigCliente } from './db';
import { buscarContatoPorTelefoneOuEmail } from './twenty';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// GET /api/contact?client=ww-assessoria&phone=5511999999999
// GET /api/contact?client=ww-assessoria&email=fulano@exemplo.com
app.get('/api/contact', async (req, res) => {
  const clientId = String(req.query.client || '');
  const phone = req.query.phone ? String(req.query.phone) : undefined;
  const email = req.query.email ? String(req.query.email) : undefined;

  if (!clientId) {
    return res.status(400).json({ error: 'Parâmetro client é obrigatório.' });
  }
  if (!phone && !email) {
    return res.status(400).json({ error: 'Informe phone ou email.' });
  }

  try {
    const config = await buscarConfigCliente(clientId);
    if (!config) {
      return res.status(404).json({ error: `Nenhum cliente ativo encontrado para client_id=${clientId}.` });
    }

    const contato = await buscarContatoPorTelefoneOuEmail(config.crm_base_url, config.crm_api_token, phone, email);

    if (!contato) {
      return res.status(404).json({ error: 'Contato não encontrado no Twenty CRM.' });
    }

    return res.json(contato);
  } catch (err) {
    console.error('Erro em /api/contact:', err);
    return res.status(500).json({ error: 'Erro interno ao buscar contato.' });
  }
});

app.listen(PORT, () => {
  console.log(`Painel CRM escutando na porta ${PORT}`);
});
