# ProofHub no VS Code

Extensão interna que traz projetos, tarefas, comentários e apontamento de horas do ProofHub para dentro do editor. Toda a interface está em português.

## Conexão

O ProofHub **não tem OAuth**. A API v3 aceita apenas uma chave pessoal enviada no cabeçalho `X-API-KEY`, então não existe o fluxo de abrir o navegador e voltar autenticado sozinho. O comando `ProofHub: Conectar` faz o mais próximo disso:

1. Já vem apontada para `acme.proofhub.com`, então não pergunta nada de conta. Para outra conta, use `ProofHub: Trocar de conta`.
2. Abre o navegador direto na página de acesso à API.
3. Você copia a chave lá. **Não precisa colar nada no VS Code**: a extensão observa a área de transferência, reconhece a chave, valida contra a API e conecta sozinha.
4. O que já estava copiado antes é ignorado, e texto que não tem cara de chave nunca vira requisição.

A espera dura três minutos, mostra progresso e pode ser cancelada. Quem preferir o caminho manual usa o botão **Prefiro colar a chave**.

Se o ProofHub mudar o endereço dessa página, ajuste `proofhub.apiPagePath` nas configurações em vez de mexer no código.

A chave é **por desenvolvedor** e fica no cofre de segredos do VS Code, nunca em arquivo de configuração nem no repositório. Isso importa porque toda ação registra autoria no ProofHub: com a chave de outra pessoa, as tarefas apareceriam criadas por ela.

## Layout

A árvore vai para a **barra lateral direita** na primeira vez que abre, deixando o explorador de arquivos à esquerda intacto. `proofhub.openOnRight` desliga isso, e `ProofHub: Mover painel para a barra da direita` refaz quando quiser.

Cada tarefa mostra prazo, iniciais de quem é responsável, quantidade de subtarefas e o tempo estimado. O que passou do prazo e continua em aberto aparece com marcador vermelho. O tooltip traz projeto, lista e o começo da descrição.

## Painel da tarefa

Clicar numa tarefa abre o painel **ao lado do código**, não no navegador. Nele dá para, sem sair do editor:

- ler a descrição já formatada, com listas e links clicáveis;
- concluir e reabrir;
- ver subtarefas com o progresso `feitas/total`, marcar cada uma e criar novas;
- ler a thread de comentários com autor e data, e responder ali mesmo, com `Cmd+Enter` para enviar;
- ver as horas lançadas com o total somado, e lançar mais;
- iniciar e parar o cronômetro.

O painel é único: abrir outra tarefa reaproveita a mesma aba.

### Texto vindo do ProofHub

A API devolve descrições e comentários como HTML escapado duas vezes, no formato `&lt;div&gt;solicita&amp;ccedil;&amp;atilde;o&lt;/div&gt;`. A extensão desfaz as duas camadas e reconstrói o texto com uma lista de tags permitida: parágrafos, listas, ênfase, citação, código e links `http`. Tudo que não está na lista é descartado, mantendo só o texto, e nenhum atributo de evento ou link `javascript:` sobrevive. É por isso que o comentário aparece legível em vez de mostrar as marcações cruas.

## Buscar, filtrar e ordenar

Na barra de título da árvore: nova tarefa, busca, filtro, horas e atualizar. O ícone do filtro muda enquanto houver filtro ativo, e a árvore mostra ao lado do nome o que está filtrando.

- `ProofHub: Buscar tarefas` procura em título e descrição, com várias palavras somando condições.
- `ProofHub: Filtrar tarefas` combina somente as minhas, esconder concluídas e somente atrasadas.
- `ProofHub: Ordenar tarefas` alterna entre ordem da lista, prazo, título e sem responsável primeiro.

## Horas e gráficos

`ProofHub: Horas e gráficos` abre um painel com o resumo do seu tempo:

- cartões de hoje, semana, mês, período todo e o total estimado do que ainda está em aberto;
- gráfico de colunas por dia, com linha tracejada na meta diária e coluna verde quando a meta foi batida (`proofhub.dailyGoal`, padrão `8:00`);
- barras por semana e por mês;
- distribuição por projeto em barra proporcional, com percentual ao lado;
- a lista dos lançamentos mais recentes.

O botão no topo alterna entre somente as suas horas e as horas de toda a equipe.

## Criar tarefa

O fluxo pergunta na ordem: projeto, lista, título, responsáveis, prazo e tempo estimado. Projeto e lista são pulados quando você já tinha algo selecionado na árvore, e listas com uma opção só são escolhidas sozinhas. Responsáveis aceitam mais de uma pessoa.

## Comandos

| Comando | Ação |
|---|---|
| `ProofHub: Conectar` e `Desconectar` | conectar e remover a chave desta máquina |
| `ProofHub: Abrir tarefa` | abrir o painel da tarefa |
| `ProofHub: Nova tarefa` | criar tarefa escolhendo projeto, lista, responsáveis, prazo e estimativa |
| `ProofHub: Concluir tarefa` | concluir a tarefa selecionada |
| `ProofHub: Comentar` | comentar numa tarefa |
| `ProofHub: Iniciar cronômetro` | começar a contar, com o tempo na barra de status |
| `ProofHub: Parar cronômetro e lançar horas` | parar e lançar no timesheet do projeto |
| `ProofHub: Lançar horas` | lançar horas manualmente, no formato `H:MM` |
| `ProofHub: Minhas tarefas` | listar suas tarefas abertas em todos os projetos |
| `ProofHub: Horas e gráficos` | abrir o painel de horas |
| `ProofHub: Buscar`, `Filtrar`, `Ordenar`, `Limpar filtros` | controlar o que aparece na árvore |
| `ProofHub: Abrir no navegador` | abrir o item no ProofHub |
| `ProofHub: Abrir link` | colar um link do ProofHub e revelar o item na árvore |
| `ProofHub: Trocar de conta` | conectar em outra conta |
| `ProofHub: Mover painel para a barra da direita` | reposicionar a árvore |

## Contrato da API

Os campos seguem a [documentação oficial da API v3](https://github.com/ProofHub/api_v3), e não o que parecia razoável supor:

- os identificadores são **números**, não texto, e a comparação é sempre feita por `sameId`;
- o texto de um comentário fica em `description`, e o autor em `creator.id`;
- horas vêm em `logged_hours` e `logged_mins` separados, com a data em `date`, e o lançamento exige `project`, `timesheet_id`, `list_id` e `task_id`;
- não existe endpoint `/me`. A validação da chave cai para `GET /projects` e a identidade é resolvida pelo e-mail de contato ou por uma escolha única na lista de pessoas, guardada na máquina.

Quando uma seção do painel falha, ela diz o motivo em vez de aparecer vazia.

## Sincronização

Toda ação recarrega a tarefa e invalida só o galho afetado da árvore, então o que você vê é o que o ProofHub tem, sem varrer a conta inteira. Ao voltar o foco para a janela do VS Code, projetos e tarefa aberta são recarregados, para pegar o que a equipe mexeu no navegador. Isso é o `proofhub.syncOnFocus`, que dá para desligar em conexão ruim.

## Confiança do workspace

A extensão declara suporte a workspace não confiável e a workspace virtual: ela só fala com a API do ProofHub e nunca executa código do projeto aberto. Por isso funciona sem pedir confiança e não aparece desabilitada em pastas restritas.

## Limite de requisições

A API permite 25 requisições a cada 10 segundos por conta e IP. O cliente aplica esse limite localmente com uma janela deslizante, e quando o servidor responde `429` ele respeita o `Retry-After` antes de repetir, até três vezes. Sem isso, a árvore de um projeto grande estouraria a cota sozinha. O painel de horas varre projeto por projeto e por isso roda com barra de progresso e botão de cancelar.

## Organização do código

```
src/
  client.ts        cliente HTTP, com limite de requisições e tradução de erro
  auth.ts          conexão, captura da chave e cofre de segredos
  key-watch.ts     observação da área de transferência
  html.ts          decodificação de entidades e reconstrução segura do HTML
  format.ts        horas, datas, semana e mês
  filter.ts        busca, filtros e ordenação das tarefas
  report.ts        agregação das horas por dia, semana, mês e projeto
  tree.ts          árvore de projetos, listas e tarefas
  detail.ts        painel da tarefa
  report-panel.ts  painel de horas
  strings.ts       todo o texto visível, em português
  flows/           fluxos de várias etapas, como a criação de tarefa
  components/      shell dos webviews, seções, gráficos e primitivas de html
```

Nada em `components/`, `html.ts`, `format.ts`, `filter.ts` e `report.ts` importa `vscode`, e é justamente por isso que tudo ali é testado direto no Node.

## Desenvolver

```bash
npm install
npm run check    # tipos e testes
```

`F5` abre uma janela do VS Code com a extensão carregada.

A suíte roda sem tocar a rede, com `fetch`, relógio e área de transferência injetados. Cobre montagem de URL e cabeçalhos, corpo das mutações, tradução de erro, repetição no `429`, a janela do limitador, a captura da chave, as URLs do app, os filtros, a agregação das horas e a reconstrução do HTML, esta última usando um comentário real da conta como caso de teste.

## Ainda não implementado

- Discussões, notas e anexos.
- Editar prazo, responsável e estimativa depois que a tarefa existe.
- Anexos e etiquetas.
- Atualização em tempo real. A sincronização acontece por ação e ao voltar o foco da janela.
