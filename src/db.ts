import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export interface ClientConfig {
  client_id: string;
  crm_base_url: string;
  crm_api_token: string;
}

/**
 * Busca a configuração de um cliente na tabela client_config,
 * decifrando o token do CRM na própria consulta (pgcrypto).
 * Retorna null se o client_id não existir ou estiver inativo.
 */
export async function buscarConfigCliente(clientId: string): Promise<ClientConfig | null> {
  const chaveMestra = process.env.CHAVE_MESTRA_TOKENS;
  if (!chaveMestra) {
    throw new Error('CHAVE_MESTRA_TOKENS não está definida nas variáveis de ambiente.');
  }

  const result = await pool.query(
    `SELECT client_id, crm_base_url, pgp_sym_decrypt(crm_api_token_enc, $2) AS crm_api_token
     FROM client_config
     WHERE client_id = $1 AND ativo = true`,
    [clientId, chaveMestra]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0] as ClientConfig;
}

export async function encerrarConexao(): Promise<void> {
  await pool.end();
}
