import {
  exigirAplicativoAtero
} from "./access-guard.js?v=1";


async function iniciar() {
  const acesso =
    await exigirAplicativoAtero({
      appId: "calc",
      nomeFallback:
        "Atero Calc"
    });

  if (!acesso) {
    return;
  }

  const modulo =
    await import(
      "./app.js?v=1"
    );

  await modulo.iniciarAplicativo({
    usuario:
      acesso.user,

    aplicativo:
      acesso.app
  });
}


iniciar();
