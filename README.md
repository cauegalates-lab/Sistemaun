# Painel Comercial UNIFAHE — V4

Versão reorganizada do painel comercial, com foco em leitura rápida do dashboard, auditoria simples de vendas e comprovantes.

## O que mudou nesta versão

- Dashboard com menos cards e maior integração visual com a página.
- Faixa única de indicadores mensais e uma linha compacta para o dia selecionado.
- Metas de faturamento e matrículas com realizado, meta, quanto falta e percentual na mesma linha.
- Gráficos reorganizados em três áreas: projeção das metas, distribuição por pagamento e faturamento por modalidade.
- Vendas marcadas como `Não OK` são desconsideradas dos indicadores do dashboard.
- Primeira coluna da área Vendas dedicada à auditoria:
  - `Pendente` ao criar a venda;
  - Gestor pode definir apenas `Venda OK` ou `Venda não OK`;
  - Vendedor apenas visualiza o resultado da auditoria.
- Última coluna dedicada ao comprovante da venda.
- Comprovantes aceitam PDF, JPG, PNG, WEBP, DOC, DOCX e ODT, até 3 MB.
- No modo local, comprovantes ficam no IndexedDB do navegador.
- Com Supabase configurado, comprovantes ficam em bucket privado `sales-receipts` e são entregues pela API da Vercel.
- Linha da venda pode ser expandida para detalhes secundários sem aumentar o número de colunas visíveis.

## Acessos de demonstração

- Gestor: `gestor@unifahe.com.br` / `123456`
- Vendedor: `vendedor@unifahe.com.br` / `123456`

## Banco de dados

1. Crie um projeto no Supabase.
2. Execute o arquivo `supabase.sql` no SQL Editor.
3. Na Vercel configure:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Para espelhar as vendas em uma planilha, configure também:
   - `GOOGLE_SHEETS_WEBHOOK_URL`
   - `GOOGLE_SHEETS_WEBHOOK_TOKEN`

O banco é a fonte principal. A planilha continua sendo apenas um espelho em segundo plano.

## Estrutura

- `index.html` — estrutura principal.
- `styles.css` — visual completo, sem folhas de correção sobrepostas.
- `app.js` — navegação, vendas, auditoria, comprovantes e dashboard.
- `modules/` — catálogo, cálculos, utilitários e repositório de dados.
- `api/` — endpoints Vercel para vendas, auditoria e comprovantes.
- `supabase.sql` — estrutura do banco e bucket privado de comprovantes.
