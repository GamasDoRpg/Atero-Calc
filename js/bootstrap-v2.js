import {
  exigirAplicativoAtero
} from "./access-guard.js?v=2";


async function iniciar() {
  const acesso = await exigirAplicativoAtero({
    appId: "calc",
    nomeFallback: "Atero Calc"
  });

  if (!acesso) {
    return;
  }

  const modulo = await import(
    "./app.js?v=7"
  );

  await modulo.iniciarAplicativo({
    usuario: acesso.user,
    aplicativo: acesso.app
  });
}


iniciar();
