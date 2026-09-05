# Sistema Comercial UNIFAHE — V41

Versão de consolidação funcional e visual construída sobre a V40. A identidade UNIFAHE, os três perfis de acesso e as regras de desempenho existentes foram preservados.

## Principais ajustes da V41

- **Início** de Gestor e Vendedor voltou ao visual clean da versão anterior, com menos cor e menos superfícies concorrendo com o conteúdo.
- **Indicadores e Comissões** usam um seletor compacto de vendedor no topo, com navegação **Anterior / Próximo** em ordem alfabética. A antiga grade “Ver todos” foi removida.
- **Comissões** permite ao Gestor adicionar bonificação manual por vendedor, título, mês e valor. O valor entra automaticamente em **Bonificação** e no **Variável atingido**.
- **FCA > Painel semanal** permite ao Gestor escolher o vendedor, criar uma tarefa padrão ou personalizada, definir os dias da semana, salvar e remover atribuições.
- **Times** mantém os oito cards em grade 4×2 no desktop, com melhor uso do espaço. O capitão aparece somente dentro da lista, sempre no topo e identificado com coroa. Fotos de perfil, nomes e resultados dos integrantes ficam visíveis no card.
- **Configurar Times** foi reorganizado para manter logo, indicador, medição e capitão alinhados no desktop, com navegação entre os times no mesmo modal.
- **Vendas** destaca a linha em azul claro ao passar o mouse ou navegar por teclado.
- **Menu lateral recolhido** exibe o tooltip ligeiramente fora da barra, com a ponta visual totalmente visível.
- **Primeiro acesso** agora cria usuário/senha por API da Vercel no Firebase Authentication e cria o perfil no Firestore. O avatar do login ficou maior.
- **Fotos de perfil** ficam no Firebase Storage em produção e o `photo_url` é salvo no perfil do Firestore.
- **Google Sheets** recebe todas as vendas, independentemente do status de auditoria, por fila sequencial. Uma venda termina antes da próxima ser processada.
- A integração faz uma **reconciliação diária às 08:00 de São Paulo** e grava a saúde da integração. Em Vendas aparece um indicador discreto `Planilha X · Painel X · OK/Conferir`.

> Indicadores, Times, Comissões e dashboards continuam considerando somente vendas com auditoria `OK`. A planilha, por solicitação operacional, recebe todas as vendas.

## Arquitetura

- Front-end estático: `index.html`, `styles.css`, `app.js` e `modules/`.
- Firebase Authentication: sessão real de Gestor, Auditoria e Vendedor.
- Cloud Firestore: vendas, metas, FCA, times, bonificações e perfis.
- Firebase Storage: comprovantes, fotos de perfil e logos dos times.
- Vercel Functions: primeiro acesso, perfis mínimos do login, fila/reconciliação do Google Sheets, fechamento FCA e operações administrativas necessárias.
- Google Sheets API: gravação direta, sem Apps Script intermediário.

## Produção: Firebase

Projeto usado pelo front-end: `sistema-comercial-647ed`.

1. Ative **Authentication > Email/Password**.
2. Crie o **Firestore** e publique `firestore.rules`.
3. Ative o **Firebase Storage** e publique `storage.rules`.
4. Crie manualmente os acessos de **Gestor** e **Auditoria** no Firebase Authentication e os documentos correspondentes em `users/{uid}`. Não permita que o primeiro acesso público escolha uma função administrativa.

Exemplo de Gestor:

```json
{
  "name": "Gestor UNIFAHE",
  "email": "gestor@unifahe.com.br",
  "login": "gestor",
  "role": "gestor",
  "team": "Gestão Comercial",
  "sector": "Comercial",
  "active": true
}
```

Exemplo de Auditoria: use `role: "auditoria"`.

Os vendedores criam o próprio cadastro pelo botão **Primeiro acesso**. Para segurança, `FIRST_ACCESS_CODE` é obrigatório em produção.

### Primeiro acesso

O endpoint `api/first-access.js`:

1. valida o nome contra o catálogo oficial de vendedores;
2. exige o código `FIRST_ACCESS_CODE`;
3. cria o usuário no Firebase Authentication;
4. cria `users/{uid}` no Firestore;
5. identifica o time já configurado, quando existir;
6. vincula ao novo UID vendas históricas lançadas pelo Gestor antes do primeiro acesso;
7. devolve apenas os dados necessários para o front-end entrar automaticamente.

## Produção: variáveis da Vercel

Use `.env.example` como referência e configure na Vercel:

```env
FIREBASE_PROJECT_ID=sistema-comercial-647ed
FIREBASE_CLIENT_EMAIL=service-account@seu-projeto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
CRON_SECRET=gere-um-segredo-forte
FIRST_ACCESS_CODE=gere-um-codigo-interno-forte
```

Para o Google Sheets, por padrão o sistema reutiliza `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`. Se quiser uma service account separada:

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
```

Nunca coloque a chave privada no front-end ou no repositório.

## Google Sheets

Planilha vinculada:

`1YeRPIxdWW0xNaajJnldl06Egv3DA1Utnwq44pcSH374`

Link informado no projeto:

`https://docs.google.com/spreadsheets/d/1YeRPIxdWW0xNaajJnldl06Egv3DA1Utnwq44pcSH374/edit?gid=0#gid=0`

A integração procura a aba de `gid=0` e cria/completa automaticamente o cabeçalho técnico necessário.

Antes do deploy:

1. No Google Cloud do projeto da service account, ative **Google Sheets API**.
2. Abra a planilha e compartilhe como **Editor** com o e-mail usado em `FIREBASE_CLIENT_EMAIL` (ou `GOOGLE_SERVICE_ACCOUNT_EMAIL`).
3. Configure as variáveis acima na Vercel.
4. Faça o deploy.

### Fluxo da fila

- Ao criar ou alterar uma venda, ela recebe `sheet_sync_status: pending`.
- O front-end chama `/api/backend?action=sheet-sync-queue` em segundo plano.
- A função adquire um lock no Firestore e processa as vendas **uma por vez**.
- Erros ficam registrados em `sheet_sync_error` e voltam para a fila nas próximas tentativas.
- Há uma passagem automática da fila a cada hora pela Vercel.
- `/api/backend?action=sheet-reconcile` roda diariamente às **11:00 UTC**, correspondente a **08:00 em America/Sao_Paulo**, e compara IDs do Firestore com IDs da planilha, repara faltantes e remove linhas órfãs.
- O resultado é salvo em `system_health/google_sheets`.

Endpoints envolvidos:

- `api/_sheets.js`
- `api/sheet-sync-queue.js`
- `api/sheet-reconcile.js`
- `api/sheet-health.js`
- `api/sheet-delete.js`

## Fotos e arquivos

- Fotos de perfil: `profile-photos/{uid}/avatar`.
- Logos dos times: `team-logos/{teamId}/logo`.
- Comprovantes: `sales/{saleId}/...`.

No modo real, a foto de perfil não depende do IndexedDB. O IndexedDB é usado somente no modo de preview.

> O Firebase Storage em produção pode exigir billing/Blaze conforme a configuração vigente da conta Firebase.

## Preview local

O sistema real é o padrão. Para testar sem depender das contas Firebase, abra a aplicação com:

`?preview=1`

Nesse modo continuam disponíveis os usuários de teste e os repositórios locais de preview. Não use `?preview=1` no link operacional distribuído à equipe.

## Regras importantes preservadas

- Auditoria não cria, edita ou exclui vendas; audita e visualiza comprovantes.
- Gestor pode lançar/excluir vendas e gerenciar metas, times, FCA e bonificações.
- Vendedor vê apenas suas vendas e sua operação.
- Dashboards, metas atingidas, times e remuneração usam somente vendas `audit_status === "ok"`.
- O espelho do Google Sheets usa **todas** as vendas para permitir conferência operacional completa.


## V42 — Login definitivo e recuperação

- Foto/avatár do login ampliado mantendo a tela sem card.
- Acessos rápidos removidos da interface. O modo `?preview=1` continua disponível apenas para desenvolvimento, sem botões visíveis.
- Primeiro acesso agora abre integrado à própria página, sem modal/card.
- Após criar o primeiro acesso com sucesso, este navegador grava `unifahe.firstAccessCompleted`; o botão de primeiro acesso deixa de aparecer nesse dispositivo. Limpar os dados do navegador faz o botão reaparecer.
- Recuperação de senha integrada ao login por `/api/backend?action=reset-password`. O código mestre fica somente em `PASSWORD_RESET_CODE` nas variáveis da Vercel e nunca é enviado ao front-end.
- A redefinição altera a senha no Firebase Authentication e revoga sessões anteriores do usuário.

### Variáveis obrigatórias do login

- `FIRST_ACCESS_CODE`: código autorizado para criação do primeiro acesso.
- `PASSWORD_RESET_CODE`: código mestre privado usado para redefinir senha. Use um código longo e aleatório e não compartilhe com vendedores.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`: credenciais Firebase Admin para as APIs da Vercel.

### Google Sheets

A integração usa a Google Sheets API diretamente pela Vercel. Não é necessário Apps Script/`Código.gs`. A planilha vinculada é `1YeRPIxdWW0xNaajJnldl06Egv3DA1Utnwq44pcSH374`, aba `gid=0`. Ative a Google Sheets API no projeto Google Cloud da service account e compartilhe a planilha como Editor com `GOOGLE_SERVICE_ACCOUNT_EMAIL` (ou `FIREBASE_CLIENT_EMAIL` quando as mesmas credenciais forem usadas).


## V42 — compatibilidade com Vercel Hobby
- O cron da fila do Google Sheets foi alterado de horário (`0 * * * *`) para uma execução diária (`30 10 * * *`), compatível com o plano Hobby.
- A sincronização imediata e sequencial continua ocorrendo ao salvar/atualizar vendas e ao entrar no sistema; o cron diário é apenas uma redundância.
- A reconciliação permanece em `0 11 * * *` (aprox. 08:00 no horário de São Paulo). No plano Hobby, a Vercel pode executar tarefas diárias dentro da janela da hora agendada.


## Deploy-safe temporário
Esta variante remove apenas os Cron Jobs e a configuração explícita de duração do vercel.json para isolar falhas na etapa `Deploying outputs`. As APIs continuam sendo detectadas automaticamente pela Vercel e a sincronização imediata das vendas continua disponível. O fechamento FCA e a reconciliação diária automática ficam temporariamente sem agendamento até reativarmos um cron único depois que o deploy base estiver estável.


## Deploy V42 — função única
Para reduzir o empacotamento e evitar falhas na etapa `Deploying outputs` do plano Hobby, todas as rotas Node agora passam por uma única Vercel Function: `/api/backend?action=...`. Os handlers internos ficam em `server/handlers/` e não são publicados como funções separadas.
