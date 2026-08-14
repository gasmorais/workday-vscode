# ProofHub for VS Code

Extensão interna que traz projetos, tarefas, comentários e apontamento de horas do ProofHub para dentro do editor.

## Conexão

O ProofHub **não tem OAuth**. A API v3 aceita apenas uma chave pessoal enviada no cabeçalho `X-API-KEY`, então não existe o fluxo de abrir o navegador e voltar autenticado sozinho. O comando `ProofHub: Connect` faz o mais próximo disso:

1. Já vem apontada para `acme.proofhub.com`, então não pergunta nada de conta. Para outra conta, use `ProofHub: Change Account`.
2. Abre o navegador direto na página de API access.
3. Você copia a chave lá. **Não precisa colar nada no VS Code**: a extensão observa a área de transferência, reconhece a chave, valida contra a API e conecta sozinha.
4. O que já estava copiado antes é ignorado, e texto que não tem cara de chave nunca vira requisição.

A espera dura três minutos, mostra progresso e pode ser cancelada. Quem preferir o caminho manual usa o botão **Paste the key myself**.

Se o ProofHub mudar o endereço dessa página, ajuste `proofhub.apiPagePath` nas configurações em vez de mexer no código.

A chave é **por desenvolvedor** e fica no SecretStorage do VS Code, nunca em arquivo de configuração nem no repositório. Isso importa porque toda ação registra autoria no ProofHub: com a chave de outra pessoa, as tarefas apareceriam criadas por ela.

O e-mail de contato exigido pelo cabeçalho `User-Agent` é preenchido sozinho a partir da conta conectada.

## O que dá para fazer

| Comando | Ação |
|---|---|
| `ProofHub: Connect` / `Disconnect` | conectar e remover a chave desta máquina |
| `ProofHub: New Task` | criar tarefa numa lista, com responsável e prazo |
| `ProofHub: Complete Task` | concluir a tarefa selecionada |
| `ProofHub: Add Comment` | comentar numa tarefa |
| `ProofHub: Start Timer` | iniciar o cronômetro, que aparece na barra de status |
| `ProofHub: Stop Timer and Log Time` | parar e lançar as horas no timesheet do projeto |
| `ProofHub: Log Time` | lançar horas manualmente, no formato `H:MM` |
| `ProofHub: My Tasks` | listar suas tarefas abertas em todos os projetos |
| `ProofHub: Open in Browser` | abrir o item no ProofHub |
| `ProofHub: Open Link from URL` | colar um link do ProofHub e revelar o item na árvore |
| `ProofHub: Change Account` | conectar em outra conta |

A barra lateral mostra projetos, listas e tarefas, com prazo e contagem de subtarefas ao lado do título.

## Links

As URLs seguem o formato do app: `https://acme.proofhub.com/bapplite/#app/todos/project-{id}/list-{id}`. A extensão monta e interpreta esse formato, então um link colado é resolvido em projeto e lista e revelado na árvore, e um link de outra conta é recusado com aviso em vez de abrir errado.

A rota direta para uma tarefa individual não foi confirmada contra o app, então abrir uma tarefa leva à lista que a contém, a não ser que a própria API devolva a URL da tarefa.

## Confiança do workspace

A extensão declara suporte a workspace não confiável e a workspace virtual: ela só fala com a API do ProofHub e nunca executa código do projeto aberto. Por isso funciona sem pedir confiança e não aparece desabilitada em pastas restritas.

## Limite de requisições

A API permite 25 requisições a cada 10 segundos por conta e IP. O cliente aplica esse limite localmente com uma janela deslizante, e quando o servidor responde `429` ele respeita o `Retry-After` antes de repetir, até três vezes. Sem isso, a árvore de um projeto grande estouraria a cota sozinha.

## Desenvolver

```bash
npm install
npm run check    # tipos e testes
```

`F5` abre uma janela do VS Code com a extensão carregada.

Os testes cobrem o cliente HTTP com `fetch` injetado, sem tocar a rede: montagem de URL e cabeçalhos, corpo das mutações, tradução de erro, repetição no `429` e a janela do limitador. A captura da chave e a montagem das URLs do app também são testadas, com relógio e área de transferência falsos. `npm test` compila antes de rodar.

## Ainda não implementado

- Discussões e anexos.
- Editar tarefa depois de criada, além de concluir.
- Relatórios agregados de tempo. Hoje o apontamento é individual, por tarefa.
- Atualização automática da árvore. Os resultados ficam em cache para poupar a cota, então mudanças feitas fora do editor exigem `ProofHub: Refresh`.
