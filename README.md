# Painel Comercial UNIFAHE — V24

## Acesso temporário para pré-visualização

Nesta versão, o painel mantém toda a estrutura visual e os arquivos de integração Firebase da V22, mas o login está temporariamente em **modo de pré-visualização** para facilitar os testes.

- **Vendedor:** `vendedor@unifahe.com.br` / `123456`
- **Gestor:** `gestor@unifahe.com.br` / `123456`
- **Auditoria:** `auditoria@unifahe.com.br` / `123456`

Na tela de login, basta clicar em **Vendedor**, **Gestor** ou **Auditoria** para preencher e-mail e senha; depois clique em **Entrar**. O botão **Sair** retorna à mesma tela.

Enquanto esse modo estiver ativo, vendas, comprovantes e FCA usados nos testes ficam somente no navegador para não depender dos usuários definitivos do Firebase. A arquitetura Firebase permanece separada e pronta no projeto. Para reativá-la depois, altere `PREVIEW_LOGIN_ENABLED` para `false` em `modules/runtime.js`.

---

A V22 substitui o Supabase pelo Firebase fornecido para o projeto:

- Firebase Authentication: login real por senha.
- Cloud Firestore: vendas, auditoria e FCA.
- Firebase Storage: comprovantes de vendas.
- Google Sheets: recebe a venda somente após Auditoria/Gestor marcar **Venda OK**.
- Vercel: hospeda o painel e protege o token do webhook da planilha.

## Firebase conectado

Projeto: `sistema-comercial-647ed`

O `firebaseConfig` público está centralizado em `modules/firebase.js`. A API key Web do Firebase não é uma senha administrativa; as permissões reais ficam nas Rules e no Authentication.

## 1. Ative Authentication

Firebase Console → Authentication → Sign-in method → Email/Password → Ativar.

Crie estes usuários no Authentication com as senhas que você definir:

| Login exibido | E-mail interno do Firebase | role |
|---|---|---|
| Gestor | gestor@unifahe.com.br | gestor |
| Auditoria | auditoria@unifahe.com.br | auditoria |
| Cauê Galates | caue@unifahe.com.br | vendedor |
| Daniela Moura | daniela@unifahe.com.br | vendedor |
| Lara Baptista | lara@unifahe.com.br | vendedor |
| Letícia Vieira | leticia@unifahe.com.br | vendedor |
| Beatriz | beatriz@unifahe.com.br | vendedor |
| Gabriel | gabriel@unifahe.com.br | vendedor |
| Alana | alana@unifahe.com.br | vendedor |
| Giseli | giseli@unifahe.com.br | vendedor |
| Nathália | nathalia@unifahe.com.br | vendedor |

No painel o usuário não digita e-mail: escolhe o nome no select e informa apenas a senha.

## 2. Crie o Firestore

Firebase Console → Firestore Database → Create database.

Depois abra a aba **Rules**, substitua pelas regras do arquivo `firestore.rules` e publique.

## 3. Crie os perfis em `users`

Após criar cada usuário no Authentication, copie o UID dele.

No Firestore crie a coleção `users`. O ID de cada documento deve ser exatamente o UID do Authentication.

Exemplo Gestor:

```json
{
  "name": "Gestor",
  "email": "gestor@unifahe.com.br",
  "role": "gestor",
  "active": true
}
```

Exemplo vendedor:

```json
{
  "name": "Cauê Galates",
  "email": "caue@unifahe.com.br",
  "role": "vendedor",
  "active": true
}
```

Auditoria usa `role: "auditoria"`.

IMPORTANTE: o campo `name` dos vendedores deve ser exatamente igual ao nome mostrado no select. Isso permite ao Gestor lançar uma venda em nome de qualquer vendedor e o sistema localizar o UID correto.

## 4. Ative Storage para comprovantes

Firebase Console → Storage → Get started.

Publique o conteúdo de `storage.rules` nas Rules do Storage.

Cada venda aceita até três comprovantes, com no máximo 3 MB cada. Auditoria pode visualizar, mas não adicionar nem excluir.

## 5. Google Sheets após Venda OK

O fluxo é:

1. Vendedor lança → Firestore.
2. Comprovantes → Firebase Storage.
3. Auditoria avalia.
4. Pendente / Falta documentação / Falta comprovante → não envia à planilha.
5. Venda OK → `/api/sheet-sync` valida a sessão Firebase, lê a venda diretamente no Firestore e envia ao Apps Script.
6. Apps Script grava/updata pela coluna `ID VENDA` na aba `Vendas`.

Planilha já definida:
`1BzqFOj4TaLjpgRmnocQxxlQq8O7wWeOQsxbTzZI0gUQ`

Aba: `Vendas`.

Use `google-apps-script.gs` em Extensões → Apps Script da planilha.

Na Vercel ficam somente:

```env
GOOGLE_SHEETS_WEBHOOK_URL=https://script.google.com/macros/s/SEU_WEBAPP/exec
GOOGLE_SHEETS_WEBHOOK_TOKEN=SEU_TOKEN
```

O mesmo token deve estar nas Propriedades do Script do Apps Script como `WEBHOOK_TOKEN`.

## 6. Arquitetura

- `modules/firebase.js` — inicialização, Authentication e perfil do usuário.
- `modules/repository.js` — Firestore + Storage para vendas/comprovantes.
- `modules/fca-repository.js` — Firestore para FCA e ações.
- `firestore.rules` — permissões por perfil.
- `storage.rules` — permissões dos comprovantes.
- `api/sheet-sync.js` — valida token Firebase e envia somente venda OK ao Google Sheets.

Não há mais código do Supabase nesta versão.


## Ajustes V24
- Auditoria com ícones mais minimalistas e status amarelo identificado como **Pendente**.
- Tooltip de auditoria é encerrado imediatamente após seleção para não permanecer travado na tela.
- Área de comprovantes abre diretamente com o campo de anexar arquivo; não existe mais a etapa “Adicionar novo comprovante”.

## V25 — dashboard individual e metas do gestor

- O **Início do vendedor** agora usa um dashboard exclusivo, com as metas mensais de **faturamento**, **matrículas** e **boletos**.
- Para cada meta são mostrados: realizado/meta, **gap do ritmo**, quanto falta, quanto precisa produzir por dia útil restante, projeção de fechamento e percentual atingido.
- O cálculo de dias úteis considera **segunda a sexta-feira**.
- O **dashboard geral do gestor foi mantido**.
- O gestor ganhou o menu **Indicadores**, onde escolhe o mês e o vendedor e define as três metas.
- Em modo de pré-visualização as metas ficam no `localStorage`. No Firebase ficam na coleção `sales_goals`.
- Publique o `firestore.rules` desta versão antes de ativar o login Firebase definitivo, pois ele inclui as permissões de `sales_goals`.


## V28 — refinamento visual do dashboard do vendedor
O conteúdo e os indicadores foram mantidos. A versão reorganiza a hierarquia visual, integra dias úteis/restantes/vendas OK ao hero azul, refina metas, resultado de hoje e composição dos gráficos.


## V29 — Dashboard do vendedor dentro de Indicadores
- No perfil Gestor, clicar em um vendedor na lista de Indicadores abre o mesmo dashboard individual daquele vendedor.
- A visualização possui botão Voltar aos indicadores, navegação Anterior/Próximo em ordem alfabética e a opção Ver todos os vendedores.
- Ver todos os vendedores abre uma busca e uma grade alfabética para trocar de vendedor sem sair do dashboard.
- O dashboard continua calculado somente com vendas auditadas como OK.


## V30 - vendedores completos e remuneração FCA

- Lista de vendedores atualizada para 32 nomes em Indicadores, Comissões e demais seletores que usam o catálogo central.
- A área Comissões agora considera somente vendas auditadas como **OK**.
- A remuneração foi separada em quatro grupos para não misturar conceitos:
  - **Comissão:** faixas por matrículas + comissão sobre quitado.
  - **Bonificação:** produção de matrículas em boleto.
  - **Bônus:** superação de meta de boleto + superação de meta de quitado.
  - **Premiações:** ranking mensal; destaque semanal e consistência permanecem identificados separadamente.
- O salário base de R$ 1.763,00 aparece como **Fixo base**, fora do total de comissão.
- Indicadores ganhou o campo **Meta de quitado (bônus FCA)** para não confundir a meta geral de faturamento com a meta usada no bônus de quitado.
- A regra de bônus/premiações que exige 3 meses aparece como condição de elegibilidade; o painel calcula o valor atingido pela produção, mas a concessão final depende dessa validação.
- A bonificação por produção em boleto usa a quantidade de matrículas registradas nas vendas em boleto (`course_quantity`).
- A comissão sobre quitado usa o valor das vendas em Cartão como valor quitado no modelo atual.
