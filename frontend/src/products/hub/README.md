# PetMi Hub (UI)

O código do Hub foi movido para o pacote monorepo [`packages/hub-ui`](../../../packages/hub-ui) e a app web dedicada [`apps/hub-web`](../../../apps/hub-web).

- Comando na raiz: `npm run dev:hub-web`
- No Vet, defina `REACT_APP_HUB_WEB_URL` (ex.: `http://localhost:3002`) para os links `/hub/*` redirecionarem para a app Hub.
