export interface ContatoMatch {
  id: string;
  nome: string;
  linkTwenty: string;
}

export interface ContatoCriado {
  id: string;
  linkTwenty: string;
}

interface TwentyPerson {
  id: string;
  name?: { firstName?: string; lastName?: string };
  emails?: { primaryEmail?: string };
  phones?: { primaryPhoneNumber?: string; primaryPhoneCountryCode?: string };
  [key: string]: unknown;
}

function nomeDaPessoa(p: TwentyPerson): string {
  return [p.name?.firstName, p.name?.lastName].filter(Boolean).join(' ') || 'Sem nome';
}

function paraMatch(p: TwentyPerson, crmBaseUrl: string): ContatoMatch {
  return {
    id: p.id,
    nome: nomeDaPessoa(p),
    linkTwenty: `${crmBaseUrl.replace(/\/$/, '')}/object/person/${p.id}`
  };
}

function pessoaBate(p: TwentyPerson, telefoneNormalizado?: string, emailNormalizado?: string): boolean {
  const phoneNum = p.phones?.primaryPhoneNumber?.replace(/\D/g, '');
  const mail = p.emails?.primaryEmail?.toLowerCase().trim();
  return Boolean(
    (telefoneNormalizado && phoneNum && phoneNum.endsWith(telefoneNormalizado.slice(-8))) ||
    (emailNormalizado && mail && mail === emailNormalizado)
  );
}

/**
 * Busca filtrada server-side. Sintaxe CONFIRMADA ao vivo em 18/08 contra a
 * instância real (`https://twenty.srv1885364.hstgr.cloud`, com um contato de
 * teste "Maria Eduarda"): `filter=campo[operador]:"valor"`, `like` com `%`
 * como wildcard SQL pra telefone, `eq` pra e-mail, `or(...)` combinando os
 * dois. Ex. testado: `filter=phones.primaryPhoneNumber[like]:"%92065308%"`
 * devolveu só a Maria (totalCount:1); um número inexistente devolveu
 * totalCount:0 — não é filtro decorativo, filtra de verdade.
 *
 * A sintaxe alternativa com colchetes (`filter[phones.primaryPhoneNumber][contains]=...`)
 * NÃO funciona: a API responde 200 mas ignora o filtro e devolve tudo. Por
 * isso buscarContatosPorTelefoneOuEmail revalida todo resultado no cliente
 * antes de considerar match — mesmo com a sintaxe certa, é uma rede de
 * segurança barata contra a API silenciosamente devolvendo mais do que devia.
 *
 * Ainda assim mantém o fallback abaixo pra qualquer 4xx/5xx real (ex: campo
 * renomeado numa atualização futura do Twenty).
 */
async function buscarPessoasFiltradas(
  crmBaseUrl: string,
  token: string,
  telefoneNormalizado?: string,
  emailNormalizado?: string
): Promise<TwentyPerson[] | null> {
  const condicoes: string[] = [];
  const ultimos8 = telefoneNormalizado?.slice(-8);
  if (ultimos8) condicoes.push(`phones.primaryPhoneNumber[like]:"%${ultimos8}%"`);
  if (emailNormalizado) condicoes.push(`emails.primaryEmail[eq]:"${emailNormalizado}"`);
  if (condicoes.length === 0) return [];

  const filtro = condicoes.length > 1 ? `or(${condicoes.join(',')})` : condicoes[0];
  const url = `${crmBaseUrl.replace(/\/$/, '')}/rest/people?filter=${encodeURIComponent(filtro)}&limit=50`;

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) return null;

  const data = await resp.json();
  return data?.data?.people ?? data?.people ?? data?.data ?? [];
}

/**
 * Fallback quando o filtro server-side falha: busca uma página limitada e
 * deixa a revalidação em buscarContatosPorTelefoneOuEmail filtrar de verdade.
 * limit reduzido de 500 pra 100 (volume atual do W&W não precisa de mais, e
 * isso é só o pior caso — o caminho feliz usa o filtro acima).
 */
async function buscarPessoasSemFiltro(crmBaseUrl: string, token: string): Promise<TwentyPerson[]> {
  const url = `${crmBaseUrl.replace(/\/$/, '')}/rest/people?limit=100`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!resp.ok) {
    throw new Error(`Twenty API respondeu ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  return data?.data?.people ?? data?.people ?? data?.data ?? [];
}

/**
 * Busca pessoas no Twenty CRM por telefone (últimos 8 dígitos) e/ou e-mail.
 * Retorna TODOS os matches (não só o primeiro) — o chamador decide o que
 * fazer com 0, 1 ou 2+ resultados (cadastro, iframe direto, aviso de duplicado).
 */
export async function buscarContatosPorTelefoneOuEmail(
  crmBaseUrl: string,
  token: string,
  telefone?: string,
  email?: string
): Promise<ContatoMatch[]> {
  if (!telefone && !email) return [];

  const telefoneNormalizado = telefone?.replace(/\D/g, '');
  const emailNormalizado = email?.toLowerCase().trim();

  let pessoas: TwentyPerson[] | null = null;
  try {
    pessoas = await buscarPessoasFiltradas(crmBaseUrl, token, telefoneNormalizado, emailNormalizado);
  } catch (err) {
    console.error('Filtro server-side do Twenty falhou, caindo pro fallback client-side:', err);
  }

  if (pessoas === null) {
    pessoas = await buscarPessoasSemFiltro(crmBaseUrl, token);
  }

  return pessoas
    .filter((p) => pessoaBate(p, telefoneNormalizado, emailNormalizado))
    .map((p) => paraMatch(p, crmBaseUrl));
}

/**
 * Normaliza um telefone brasileiro pro formato esperado em primaryPhoneNumber:
 * remove tudo que não é dígito e tira o código de chamada do país (55) se
 * vier junto, já que primaryPhoneCountryCode cobre o país separadamente.
 * Assume Brasil porque é a única base de clientes hoje (ver CLAUDE.md) — se
 * a stack ganhar cliente fora do Brasil, isso precisa virar parâmetro.
 */
function normalizarTelefoneBr(telefone: string): string {
  const digitos = telefone.replace(/\D/g, '');
  return digitos.length > 11 && digitos.startsWith('55') ? digitos.slice(2) : digitos;
}

/**
 * Cria uma Person "stub" no Twenty CRM só com nome e telefone — os demais
 * campos (e-mail, empresa etc.) ficam em branco pro comercial preencher
 * depois direto no Twenty.
 *
 * Formato do campo `phones` CONFIRMADO ao vivo em 18/08 com um GET num
 * contato real (Maria Eduarda, cadastrada manualmente com telefone
 * +55 51 99206-5308): `{ primaryPhoneNumber: "51992065308", primaryPhoneCountryCode: "BR",
 * primaryPhoneCallingCode: "+55", additionalPhones: [] }` — primaryPhoneNumber
 * é DDD+número, SEM o código de chamada do país (isso fica em
 * primaryPhoneCallingCode, campo separado). Não testei o POST de criação em
 * si (só o GET, como pedido) — se o create rejeitar por faltar
 * additionalPhones ou outro subcampo, é o próximo lugar a olhar.
 */
export async function criarContatoStub(
  crmBaseUrl: string,
  token: string,
  dados: { nome: string; telefone: string }
): Promise<ContatoCriado> {
  const [firstName, ...resto] = dados.nome.trim().split(/\s+/);
  const lastName = resto.join(' ');

  const url = `${crmBaseUrl.replace(/\/$/, '')}/rest/people`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: { firstName: firstName || dados.nome, lastName },
      phones: {
        primaryPhoneNumber: normalizarTelefoneBr(dados.telefone),
        primaryPhoneCountryCode: 'BR',
        primaryPhoneCallingCode: '+55'
      }
    })
  });

  if (!resp.ok) {
    throw new Error(`Twenty API respondeu ${resp.status} ao criar contato: ${await resp.text()}`);
  }

  const data = await resp.json();
  const pessoa = data?.data?.createPerson ?? data?.data ?? data;
  if (!pessoa?.id) {
    throw new Error('Twenty API não retornou id da pessoa criada.');
  }

  return {
    id: pessoa.id,
    linkTwenty: `${crmBaseUrl.replace(/\/$/, '')}/object/person/${pessoa.id}`
  };
}
