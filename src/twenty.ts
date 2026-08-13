export interface ResumoContato {
  nome: string;
  etapaFunil: string | null;
  ultimaAtividade: string | null;
  linkTwenty: string;
}

interface TwentyPerson {
  id: string;
  name?: { firstName?: string; lastName?: string };
  emails?: { primaryEmail?: string };
  phones?: { primaryPhoneNumber?: string; primaryPhoneCountryCode?: string };
  ultimoEnvioData?: string;
  [key: string]: unknown;
}

/**
 * Busca um contato no Twenty CRM por telefone ou e-mail.
 *
 * NOTA: o filtro é feito no lado do cliente (busca a lista e compara),
 * não pelo parâmetro `filter` da API do Twenty — a sintaxe exata de operador
 * (ex: phones.primaryPhoneNumber[eq]:...) precisa ser confirmada no playground
 * embutido da API antes de otimizar isso para filtro no servidor.
 * Para o volume do W&W (centenas de contatos) isso é rápido o suficiente.
 */
export async function buscarContatoPorTelefoneOuEmail(
  crmBaseUrl: string,
  token: string,
  telefone?: string,
  email?: string
): Promise<ResumoContato | null> {
  if (!telefone && !email) return null;

  const url = `${crmBaseUrl.replace(/\/$/, '')}/rest/people?limit=500`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    throw new Error(`Twenty API respondeu ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  const pessoas: TwentyPerson[] = data?.data?.people ?? data?.people ?? data?.data ?? [];

  const telefoneNormalizado = telefone?.replace(/\D/g, '');
  const emailNormalizado = email?.toLowerCase().trim();

  const encontrado = pessoas.find((p) => {
    const phoneNum = p.phones?.primaryPhoneNumber?.replace(/\D/g, '');
    const mail = p.emails?.primaryEmail?.toLowerCase().trim();
    return (
      (telefoneNormalizado && phoneNum && phoneNum.endsWith(telefoneNormalizado.slice(-8))) ||
      (emailNormalizado && mail && mail === emailNormalizado)
    );
  });

  if (!encontrado) return null;

  const nome = [encontrado.name?.firstName, encontrado.name?.lastName].filter(Boolean).join(' ') || 'Sem nome';

  return {
    nome,
    etapaFunil: (encontrado['etapaFunil'] as string) ?? null,
    ultimaAtividade: (encontrado['ultimoEnvioData'] as string) ?? null,
    linkTwenty: `${crmBaseUrl.replace(/\/$/, '')}/object/person/${encontrado.id}`
  };
}
