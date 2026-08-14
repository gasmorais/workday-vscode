let counter = 0;

export function page(body: string): string {
  const nonce = `n${(counter += 1)}${process.hrtime.bigint()}`;
  const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>${STYLE}</style></head><body>${body}
<script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}

const STYLE = `
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 16px 40px; }
h1 { font-size: 1.35em; margin: 10px 0 8px; line-height: 1.3; }
h1.done { text-decoration: line-through; opacity: .6; }
h2 { display: flex; align-items: center; font-size: .8em; text-transform: uppercase; letter-spacing: .08em; opacity: .7; margin: 26px 0 8px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; }
.crumbs { opacity: .65; margin: 12px 0 0; font-size: .9em; }
.chip { display: inline-flex; align-items: center; height: 18px; padding: 0 8px; border-radius: 9px; font-size: 11px; line-height: 1; font-weight: 500; letter-spacing: .01em; white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; border: 1px solid transparent; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.chip.quiet { background: transparent; border-color: var(--vscode-panel-border); color: var(--vscode-descriptionForeground, var(--vscode-foreground)); }
.chip.neutral { background: var(--vscode-editorWidget-background); border-color: var(--vscode-panel-border); color: var(--vscode-foreground); }
.chip.accent { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.chip.ok { background: transparent; border-color: var(--vscode-charts-green, #40a02b); color: var(--vscode-charts-green, #40a02b); }
.chip.warn { background: transparent; border-color: var(--vscode-charts-orange, #e08c3b); color: var(--vscode-charts-orange, #e08c3b); }
.chip.danger { background: transparent; border-color: var(--vscode-charts-red, #d9534f); color: var(--vscode-charts-red, #d9534f); }
.count { display: inline-flex; align-items: center; height: 16px; padding: 0 7px; margin-left: 6px; border-radius: 8px; font-size: 11px; line-height: 1; font-weight: 600; letter-spacing: 0; text-transform: none; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); vertical-align: 1px; }
.meta { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: 10px 0 0; }
.actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 14px 0 0; }
header { padding-bottom: 4px; }
button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 2px; cursor: pointer; font-family: inherit; font-size: inherit; }
button:hover { background: var(--vscode-button-hoverBackground); }
input, textarea, select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, transparent); padding: 4px 6px; border-radius: 2px; font-family: inherit; font-size: inherit; }
form { display: flex; gap: 6px; margin-top: 10px; align-items: flex-start; flex-wrap: wrap; }
form input[name=title], form input[name=description], form textarea { flex: 1; min-width: 140px; }
.hint { opacity: .55; font-size: .8em; margin: 4px 0 0; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { padding: 7px 0; border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; align-items: center; }
.list li:last-child { border-bottom: none; }
.list.comments li { align-items: stretch; padding: 10px 0; }
.list li span.done { text-decoration: line-through; opacity: .6; }
.list label { display: flex; gap: 8px; align-items: baseline; flex: 1; cursor: pointer; }
.list.comments li { display: block; }
.who { margin: 0 0 5px; font-weight: 600; font-size: .9em; display: flex; gap: 8px; align-items: baseline; }
.hours { font-variant-numeric: tabular-nums; min-width: 48px; text-align: right; font-weight: 600; }
.grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.who-inline { color: var(--vscode-descriptionForeground, var(--vscode-foreground)); font-size: .85em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
.muted { opacity: .6; font-size: .85em; white-space: nowrap; }
.prose { line-height: 1.55; overflow-wrap: anywhere; }
.prose p { margin: 0 0 8px; }
.prose ul, .prose ol { margin: 0 0 8px; padding-left: 20px; }
.prose a { color: var(--vscode-textLink-foreground); }
.prose code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 2px; }
.prose blockquote { margin: 0 0 8px; padding-left: 10px; border-left: 2px solid var(--vscode-panel-border); opacity: .85; }
.as-link { background: none; color: var(--vscode-textLink-foreground); padding: 0; text-align: left; }
.as-link:hover { background: none; text-decoration: underline; }
.as-link.done { text-decoration: line-through; opacity: .6; color: var(--vscode-foreground); }
.empty { opacity: .6; font-style: italic; margin: 8px 0; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 1fr)); gap: 8px; margin-top: 14px; }
.card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; display: flex; flex-direction: column; gap: 2px; }
.card .value { font-size: 1.4em; font-variant-numeric: tabular-nums; }
.card .label { opacity: .65; font-size: .78em; }
.bars li { align-items: center; }
.bar-label { min-width: 92px; opacity: .8; font-size: .85em; }
.bar { flex: 1; background: var(--vscode-panel-border); height: 8px; border-radius: 4px; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--vscode-charts-blue, var(--vscode-button-background)); }
.columns { overflow-x: auto; padding-top: 6px; }
.plot { position: relative; display: flex; gap: 6px; align-items: flex-end; min-height: 150px; }
.col { flex: 1; min-width: 34px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.col-value { font-size: .72em; opacity: .75; font-variant-numeric: tabular-nums; height: 1em; }
.col-track { width: 100%; height: 110px; display: flex; align-items: flex-end; background: var(--vscode-editorWidget-background); border-radius: 3px; }
.col-bar { width: 100%; min-height: 2px; border-radius: 3px; background: var(--vscode-charts-blue, var(--vscode-button-background)); }
.col-bar.reached { background: var(--vscode-charts-green, var(--vscode-testing-iconPassed)); }
.col-key { font-size: .72em; opacity: .65; white-space: nowrap; }
.goal { position: absolute; left: 0; right: 0; bottom: 0; margin-bottom: 22px; border-top: 1px dashed var(--vscode-charts-orange, var(--vscode-foreground)); opacity: .7; pointer-events: none; }
.goal span { position: absolute; right: 0; top: -1.1em; font-size: .68em; opacity: .8; }
.stack { display: flex; height: 14px; border-radius: 7px; overflow: hidden; margin: 6px 0 10px; background: var(--vscode-editorWidget-background); }
.slice { display: block; height: 100%; }
.legend li { border-bottom: none; padding: 3px 0; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.tone0 { background: var(--vscode-charts-blue, #4a8cff); }
.tone1 { background: var(--vscode-charts-green, #40a02b); }
.tone2 { background: var(--vscode-charts-orange, #e08c3b); }
.tone3 { background: var(--vscode-charts-purple, #9a6ad9); }
.tone4 { background: var(--vscode-charts-red, #d9534f); }
.tone5 { background: var(--vscode-charts-yellow, #d4b106); }
`;

const SCRIPT = `
const vs = acquireVsCodeApi();
document.addEventListener('click', (e) => {
  const target = e.target.closest('button[data-act]');
  if (target) { vs.postMessage({ act: target.dataset.act, id: target.dataset.id }); }
});
document.addEventListener('change', (e) => {
  const box = e.target.closest('input[data-subtask]');
  if (box) { vs.postMessage({ act: 'toggleSubtask', id: box.dataset.subtask, value: box.checked }); }
});
document.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  vs.postMessage({ act: form.dataset.form, value: Object.fromEntries(new FormData(form).entries()) });
  form.reset();
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    const form = e.target.closest('form');
    if (form) { form.requestSubmit(); }
  }
});
`;
