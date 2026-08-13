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
  [key: string]: unknown;
}

interface TwentyOpportunity {
  id: string;
  name?: string;
  stage?: string;
  closeDate?: string;
  pointOfContact?: { id?: string };
  pointOfContactId?: string;
  [key: string]: unknown;
}

/**
 * Busca as oportunidades vinculadas a uma pessoa no Twenty CRM.
 *
 * Mesmo padrão de busca client-side de buscarContatoPorTelefoneOuEmail — a
 * sintaxe de filtro nativo (`filter=...`) ainda não foi confirmada no
 * playground da API.
 */
async function buscarOportunidadesDaPessoa(
  crmBaseUrl: string,
  token: string,
  pessoaId: string
): Promise<TwentyOpportunity[]> {
  const url = `${crmBaseUrl.replace(/\/$/, '')}/rest/opportunities?limit=500`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    throw new Error(`Twenty API respondeu ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  const oportunidades: TwentyOpportunity[] = data?.data?.opportunities ?? data?.opportunities ?? data?.data ?? [];

  return oportunidades.filter((o) => {
    const contatoId = o.pointOfContact?.id ?? (o.pointOfContactId as string | undefined);
    return contatoId === pessoaId;
  });
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

  let etapaFunil: string | null = null;
  let ultimaAtividade: string | null = null;

  try {
    const oportunidades = await buscarOportunidadesDaPessoa(crmBaseUrl, token, encontrado.id);

    const maisRecente = [...oportunidades].sort((a, b) => {
      const dataA = a.closeDate ? new Date(a.closeDate).getTime() : 0;
      const dataB = b.closeDate ? new Date(b.closeDate).getTime() : 0;
      return dataB - dataA;
    })[0];

    if (maisRecente) {
      etapaFunil = maisRecente.stage ?? null;
      const dataFechamento = maisRecente.closeDate ? maisRecente.closeDate.slice(0, 10) : null;
      ultimaAtividade = maisRecente.name
        ? `${maisRecente.name}${dataFechamento ? ` — fecha em ${dataFechamento}` : ''}`
        : null;
    }
  } catch (err) {
    // Busca de oportunidade é best-effort: se falhar, devolve nome e link normalmente, só sem a etapa.
    console.error('Erro ao buscar oportunidades no Twenty:', err);
  }

  return {
    nome,
    etapaFunil,
    ultimaAtividade,
    linkTwenty: `${crmBaseUrl.replace(/\/$/, '')}/object/person/${encontrado.id}`
  };
}
