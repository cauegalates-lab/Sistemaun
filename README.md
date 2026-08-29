# Painel Comercial UNIFAHE — V15

Versão com vendas, auditoria por perfil, até três comprovantes, dashboard no Início, FCA vendedor ↔ gestor, comissões e perfil com foto.

## Ajustes V15

- Clicar no seletor de auditoria não expande mais os detalhes da venda; a linha só expande quando o clique ocorre em uma área informativa da própria venda.
- O comportamento foi tratado no manipulador principal da linha, evitando conflito com controles interativos presentes na tabela.
- As mensagens de auditoria agora abrem para a direita do ícone, com seta visual, evitando corte junto à lateral esquerda da tabela/menu.

## Ajustes V13

- A auditoria passou a ser definida diretamente por um select na coluna da venda, sem abrir modal central.
- O select permite escolher somente **Venda OK** ou **Venda não OK**, mantendo **Pendente** enquanto ainda não houver decisão.
- No visualizador de comprovantes, o zoom continua na roda do mouse e o deslocamento da imagem agora é feito segurando o **botão esquerdo** e arrastando.


## Ajustes V11

### Comprovantes
- O visualizador continua abrindo dentro do próprio painel.
- Para imagens, a roda do mouse controla o zoom: para frente aumenta e para trás diminui.
- As barras de rolagem foram removidas do visualizador de imagem.
- Para navegar em uma imagem ampliada, segure o botão esquerdo do mouse e arraste.
- Em telas touch, o arraste continua disponível pelo toque.
- O botão Voltar retorna à lista dos comprovantes.

### Navegação e Dashboard
- O item Dashboard foi removido do menu lateral.
- O Dashboard é a própria página Início.
- Gestor: inicia no Dashboard geral e pode alternar para o individual dentro da própria página.
- Vendedor: inicia no Dashboard individual e não possui acesso ao geral.

### Perfil Auditoria
- Novo perfil `auditoria`.
- O menu mostra somente Vendas.
- Pode visualizar todas as vendas.
- Pode definir Venda OK ou Venda não OK.
- Pode abrir e visualizar comprovantes.
- Não pode lançar vendas, adicionar comprovantes nem excluir comprovantes.

### FCA
- Vendedor envia relatório semanal ou mensal ao gestor.
- O relatório registra período, indicador principal, situação, motivo, pontos positivos, dificuldades, próxima ação e apoio necessário.
- O painel calcula e salva junto ao FCA um resumo do período: faturado, vendas, matrículas, quitados/cartão e boletos.
- Gestor recebe os relatórios no próprio FCA.
- Ao abrir um relatório, o gestor pode solicitar feedback ao vendedor ou criar uma ação.
- Solicitação de feedback aparece no FCA do vendedor e permite resposta.
- Ações criadas pelo gestor aparecem no FCA do vendedor com título, descrição e prazo.
- O vendedor pode marcar a ação como concluída.

## Acessos de demonstração

- Gestor: `gestor@unifahe.com.br` / `123456`
- Vendedor: `vendedor@unifahe.com.br` / `123456`
- Auditoria: `auditoria@unifahe.com.br` / `123456`

## Banco

Execute o `supabase.sql` atualizado para criar as tabelas `fca_reports` e `fca_actions` além das estruturas já existentes de vendas e comprovantes.

## Estrutura principal

- `index.html` — base da aplicação e login.
- `styles.css` — interface e responsividade.
- `app.js` — navegação, vendas, auditoria, comprovantes, FCA, dashboard e comissões.
- `modules/repository.js` — vendas e comprovantes.
- `modules/fca-repository.js` — relatórios FCA, feedbacks e ações.
- `modules/dashboard.js` — métricas e gráficos.
- `modules/commissions.js` — produção e bonificações.
- `api/fca.js` — persistência do fluxo FCA.
- `supabase.sql` — esquema completo atualizado.

## Auditoria por ícones

A auditoria agora usa um seletor visual compacto: check verde = Venda OK, X vermelho = Falta comprovante e bolinha amarela = Falta documentação. Os três estados exibem a descrição ao passar o ponteiro e podem ser escolhidos diretamente pelo perfil autorizado.


## V19
- Card de login centralizado no viewport.
- Mantidos os acessos de demonstração: ao clicar em Vendedor, Gestor ou Auditoria, e-mail e senha são preenchidos automaticamente, sem efetuar login até clicar em Entrar.

## V20 — Google Sheets somente após Auditoria OK

A aba **Vendas** da planilha `1BzqFOj4TaLjpgRmnocQxxlQq8O7wWeOQsxbTzZI0gUQ` passa a receber a venda somente quando o perfil autorizado marca **Venda OK**.

### Fluxo
1. Vendedor/Gestor lança a venda → salva apenas no banco.
2. Auditoria deixa como Pendente, Falta documentação ou Falta comprovante → nada é enviado à planilha.
3. Auditoria marca **Venda OK** → a API envia todos os dados da venda para a aba `Vendas`.
4. O `ID VENDA` é usado como chave: se a mesma venda for reenviada, a linha é atualizada em vez de duplicada.
5. Se a sincronização falhar, o banco grava `sheet_sync_status = error`; selecionar OK novamente tenta o envio outra vez.

### Dados enviados
ID da venda, data, vendedor, aluno, pagamento, taxa/parcela, parcelas, valor total, modalidade, pendência, curso, estado, origem, quantidade de cursos, dados da auditoria, quantidade e nomes dos até 3 comprovantes, criação e data de sincronização.

### Configuração do Google Sheets
1. Abra a planilha informada e acesse **Extensões → Apps Script**.
2. Cole o conteúdo de `google-apps-script.gs`.
3. Em **Configurações do projeto → Propriedades do script**, crie `WEBHOOK_TOKEN` com um token longo e secreto.
4. Clique em **Implantar → Nova implantação → App da Web**.
5. Execute como **você** e permita acesso ao endpoint do Web App.
6. Copie a URL terminada em `/exec` para `GOOGLE_SHEETS_WEBHOOK_URL` na Vercel.
7. Use o mesmo token em `GOOGLE_SHEETS_WEBHOOK_TOKEN` na Vercel.
8. Execute novamente `supabase.sql` no Supabase para adicionar `sheet_synced_at` e `sheet_sync_error` caso a tabela já exista.

O Apps Script não apaga colunas existentes: ele adiciona os cabeçalhos necessários que estiverem faltando e faz o upsert pelo `ID VENDA`.
