import {
  iniciarCalculadora
} from "./calculator.js?v=1";


function mostrarUsuario(usuario) {
  const elemento =
    document.querySelector(
      "#user-name"
    );

  if (!elemento) {
    return;
  }

  elemento.textContent =
    usuario?.user_metadata?.display_name ||
    usuario?.email ||
    "Conta Atero";
}


export async function iniciarAplicativo({
  usuario,
  aplicativo
}) {
  mostrarUsuario(
    usuario
  );

  iniciarCalculadora({
    usuario,
    aplicativo
  });
}
