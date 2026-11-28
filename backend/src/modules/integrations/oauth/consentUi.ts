import type { Request, Response } from 'express';
import { publicApiBase } from './oauthCrypto';

/** JS externo — Helmet CSP só permite script-src 'self' (sem inline). */
export function oauthConsentUiJsHandler(_req: Request, res: Response): void {
  const js = `(() => {
  const API = document.body.getAttribute('data-api') || '';
  const oauth = Object.fromEntries(new URLSearchParams(window.location.search));
  let token = null;
  let memberships = [];
  let units = [];

  const errEl = document.getElementById('err');
  function showErr(m) { errEl.textContent = m || ''; }

  const requiredOauth = ['client_id', 'redirect_uri', 'code_challenge'];
  const missingOauth = requiredOauth.filter(function (k) { return !oauth[k]; });
  if (missingOauth.length) {
    showErr(
      'Fluxo OAuth incompleto (faltam: ' + missingOauth.join(', ') + '). ' +
      'Feche esta aba e clique em Connect de novo no ChatGPT — a URL precisa vir de /oauth/authorize.'
    );
  }

  const scopesEl = document.getElementById('scopes');
  if (scopesEl) {
    scopesEl.textContent =
      'Escopos: ' + (oauth.scope || 'petmi.grooming.read petmi.grooming.write offline_access');
  }

  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API + path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || data.message || ('HTTP ' + res.status));
    return data;
  }

  function fillUnits() {
    const clinicId = document.getElementById('clinic').value;
    const unitSel = document.getElementById('unit');
    unitSel.innerHTML = '';
    units.filter(function (u) { return u.clinic_id === clinicId; }).forEach(function (u) {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = u.name || u.id;
      unitSel.appendChild(opt);
    });
  }

  function fillClinics() {
    const clinicSel = document.getElementById('clinic');
    clinicSel.innerHTML = '';
    memberships.forEach(function (m) {
      const opt = document.createElement('option');
      opt.value = m.clinic_id;
      opt.textContent = (m.clinics && m.clinics.name) || m.clinic_id;
      clinicSel.appendChild(opt);
    });
    clinicSel.onchange = fillUnits;
    if (memberships[0]) fillUnits();
  }

  document.getElementById('btnLogin').addEventListener('click', async function () {
    showErr('');
    try {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const login = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email, password: password }),
      });
      token = login.session && login.session.access_token;
      if (!token) throw new Error('Login sem access_token');
      const ctx = await api('/oauth/consent/context');
      memberships = ctx.memberships || [];
      units = ctx.units || [];
      if (!memberships.length) throw new Error('Nenhuma clínica ativa nesta conta');
      document.getElementById('login').hidden = true;
      document.getElementById('consent').hidden = false;
      fillClinics();
    } catch (e) {
      showErr(e.message || String(e));
    }
  });

  document.getElementById('btnApprove').addEventListener('click', async function () {
    showErr('');
    try {
      if (missingOauth.length) {
        throw new Error(
          'Fluxo OAuth incompleto (faltam: ' + missingOauth.join(', ') + '). ' +
          'Feche e inicie Connect de novo no ChatGPT.'
        );
      }
      const clinicId = document.getElementById('clinic').value;
      const unitId = document.getElementById('unit').value;
      if (!clinicId || !unitId) {
        throw new Error('Selecione clínica e unidade');
      }
      const res = await api('/oauth/consent/approve', {
        method: 'POST',
        body: JSON.stringify({
          clinic_id: clinicId,
          unit_id: unitId,
          client_id: oauth.client_id,
          redirect_uri: oauth.redirect_uri,
          scope: oauth.scope,
          state: oauth.state,
          code_challenge: oauth.code_challenge,
          code_challenge_method: oauth.code_challenge_method || 'S256',
          resource: oauth.resource,
        }),
      });
      if (!res.redirect_uri) throw new Error('Redirect ausente');
      window.location.href = res.redirect_uri;
    } catch (e) {
      showErr(e.message || String(e));
    }
  });

  document.getElementById('btnDeny').addEventListener('click', function () {
    if (!oauth.redirect_uri) return;
    const u = new URL(oauth.redirect_uri);
    u.searchParams.set('error', 'access_denied');
    if (oauth.state) u.searchParams.set('state', oauth.state);
    window.location.href = u.toString();
  });
})();`;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(js);
}

/** Página de consentimento servida pela API (evita Vercel Deployment Protection no Hub staging). */
export function oauthConsentUiHandler(_req: Request, res: Response): void {
  const api = publicApiBase();

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Autorizar PetMi Hub</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 440px; margin: 40px auto; padding: 0 16px; color: #111; }
    h1 { font-size: 1.35rem; }
    label { display: block; margin-top: 12px; font-size: 0.9rem; }
    input, select, button { width: 100%; margin-top: 4px; padding: 10px; font-size: 1rem; box-sizing: border-box; }
    button { margin-top: 16px; cursor: pointer; background: #0b5; color: #fff; border: 0; border-radius: 8px; }
    button.secondary { background: #666; }
    .err { color: #b00020; margin-top: 12px; white-space: pre-wrap; }
    .muted { color: #555; font-size: 0.9rem; }
    .row { display: flex; gap: 8px; }
    .row button { flex: 1; }
  </style>
</head>
<body data-api="${api.replace(/"/g, '&quot;')}">
  <h1>Conectar ChatGPT ao PetMi</h1>
  <p class="muted">Use a conta do <strong>PetMi Hub</strong> (não precisa ser o mesmo e-mail do ChatGPT ou da Vercel).</p>
  <div id="err" class="err"></div>

  <section id="login">
    <label>E-mail<input id="email" type="email" autocomplete="username" /></label>
    <label>Senha<input id="password" type="password" autocomplete="current-password" /></label>
    <button type="button" id="btnLogin">Entrar</button>
  </section>

  <section id="consent" hidden>
    <label>Clínica<select id="clinic"></select></label>
    <label>Unidade<select id="unit"></select></label>
    <p class="muted" id="scopes"></p>
    <div class="row">
      <button type="button" id="btnApprove">Autorizar</button>
      <button type="button" class="secondary" id="btnDeny">Recusar</button>
    </div>
  </section>

  <script src="/oauth/consent-ui.js"></script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(200).send(html);
}
