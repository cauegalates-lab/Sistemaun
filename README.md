# Painel Comercial UNIFAHE — v2

Projeto reestruturado para o fluxo solicitado, sem anexar "remendos" ao código antigo.

## O que está pronto
- Menu lateral com seta apenas no hover.
- Perfis vendedor e gestor.
- Área Vendas com formulário expansível no topo.
- Vendedor preenchido pelo login; gestor pode escolher vendedor.
- Campos condicionais por pagamento e modalidade.
- Boleto calcula automaticamente `valor da taxa/parcela × quantidade de vezes`.
- Registro em tabela compacta e responsiva.
- Dashboard geral exclusivo do gestor no Início.
- Dashboard individual para vendedor e gestor.
- Filtros por período, metas, projeção, distribuição e resumo geral.
- Todos os indicadores e gráficos são calculados a partir das vendas.
- Banco de dados como fonte principal via API da Vercel + Supabase.
- Google Sheets recebe espelho em segundo plano pelo webhook.
- Fallback local apenas para demonstração quando o banco ainda não estiver configurado.

## Login de demonstração
- Vendedor: `vendedor@unifahe.com.br` / `123456`
- Gestor: `gestor@unifahe.com.br` / `123456`

## Banco de dados
1. Crie um projeto Supabase.
2. Execute `supabase.sql` no SQL Editor.
3. Na Vercel, configure as variáveis de `.env.example`.
4. Faça o deploy.

A `SUPABASE_SERVICE_ROLE_KEY` nunca fica no navegador; ela é usada somente em `/api/sales`.

## Google Sheets
O painel funciona sem a planilha. A planilha é apenas um espelho. A API envia um POST para `GOOGLE_SHEETS_WEBHOOK_URL` depois da gravação no banco, usando o evento `sale.created`.

Payload:
```json
{ "event": "sale.created", "sale": { "...": "registro salvo" } }
```

## Desenvolvimento local
Use um servidor HTTP (por exemplo `npx vercel dev`) porque o projeto usa módulos ES e rotas `/api`.
