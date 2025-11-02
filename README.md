# ESP.EE · Painel Professor v4.5

## O que muda
- **Onboarding automático**: se o teu e‑mail não existir na configuração, a app propõe criar o professor e um grupo base.
- **Self‑healing**: se `config_especial.json` contiver `registos`, a app migra para `2registos_alunos.json` e cria config mínima.
- **Chamada por aluno** (P/F/J) no Painel do Dia.

## Publicação (GitHub Pages)
1. Criar novo repositório **esp-painel-professor-v4.5**.
2. Ativar **Settings ▸ Pages** → Branch `main` (root).
3. A app usa `<base href="/esp-painel-professor-v4.5/">` e **Redirect URI** de MSAL deve incluir:
   `https://bibliotecaesparedes-hub.github.io/esp-painel-professor-v4.5/`.

## Paths (Graph)
- Config: `/Documents/GestaoAlunos-OneDrive/config_especial.json`
- Registos: `/Documents/GestaoAlunos-OneDrive/2registos_alunos.json`
- Backups: `/Documents/GestaoAlunos-OneDrive/backup/`

## Notas
- Requer permissões delegadas (`Files.ReadWrite.All`, `User.Read`).
- Em falha de rede, grava em `localStorage` e volta a sincronizar.
