# ESP.EE · v4.5.2b (Consolidado)

- **Perfis**: Admin (biblioteca@esparedes.pt) só vê **Administração**; Professores vêem **Hoje** e **Registos** (Admin oculto e bloqueado).
- **Hoje**: agenda por **Oficinas** do professor com registo **por aluno**: Nº lição, Sumário e Presença (**Presente**, **Ausente (injust.)**, **J (just.)**).
- **Registos**: mostra **Registos em atraso** (últimos 7 dias) para completar; filtros por data.
- **Exportações**: **PDF/XLSX semanais** por professor e **PDF/XLSX por aluno** (intervalo).
- **Backup/restore** e exportações de Config/Registos.

## Publicação
- Repositório: `esp-painel-professor-v4.5` (GitHub Pages em `main`/root)
- MSAL Redirect URI deve incluir: `https://bibliotecaesparedes-hub.github.io/esp-painel-professor-v4.5/`

## Ficheiros no OneDrive/Site
- `config_especial.json` — inclui `professores`, `alunos`, `disciplinas`, `oficinas` e `calendario`.
- `2registos_alunos.json` — versão `v2`, registos **por aluno** (`status`: `P` | `A` | `J`).

## Dica
- Se a cache do browser mostrar UI antiga, força refresh (**Ctrl+F5** / **Cmd+Shift+R**) ou abre com `?v=452b` no URL.
