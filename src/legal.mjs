// 法律页草稿（西语）。公司信息为示例数据，上线前须由法律顾问审核。
export const legalPages = [
  {
    path: "aviso-de-privacidad/",
    title: "Aviso de privacidad",
    intro:
      "Este aviso explica qué datos personales tratamos cuando usas QRveo, para qué los usamos y cómo puedes ejercer tus derechos, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.",
    sections: [
      {
        h: "Responsable",
        p: [
          "QRveo México, con domicilio en Guadalajara, Jalisco, es responsable del tratamiento de tus datos personales. Contacto: hola@qrveo.com.",
        ],
      },
      {
        h: "Datos que tratamos",
        p: [
          "De los negocios que crean una cuenta: nombre, correo electrónico, contraseña cifrada, teléfono o WhatsApp y, si lo solicitas, datos de facturación.",
          "De las personas que escanean un código QR: no pedimos registro. Solo registramos datos técnicos del navegador (fecha, tipo de dispositivo y región aproximada) para generar estadísticas de reproducción para el negocio.",
        ],
      },
      {
        h: "Para qué los usamos",
        p: [
          "Finalidades necesarias: crear y administrar tu cuenta, prestar el servicio, alojar y reproducir tus videos, facturar y darte soporte.",
          "Finalidades opcionales: enviarte novedades del servicio. Puedes pedirnos que dejemos de hacerlo en cualquier momento escribiendo a hola@qrveo.com.",
        ],
      },
      {
        h: "Con quién los compartimos",
        p: [
          "Con proveedores que nos ayudan a operar el servicio (infraestructura de video, pagos y facturación), que solo pueden usarlos para ese fin. La tecnología de video la provee POLYV. No vendemos tus datos.",
        ],
      },
      {
        h: "Tus derechos",
        p: [
          "Puedes acceder, rectificar o cancelar tus datos, oponerte a su uso o revocar tu consentimiento escribiendo a hola@qrveo.com. Te responderemos en los plazos que marca la ley.",
        ],
      },
      {
        h: "Cookies",
        p: ["Usamos cookies técnicas para mantener tu sesión iniciada y medir de forma general el uso del sitio."],
      },
      {
        h: "Cambios a este aviso",
        p: ["Publicaremos cualquier cambio en esta página. Última actualización: octubre de 2026."],
      },
    ],
  },
  {
    path: "terminos/",
    title: "Términos y condiciones",
    intro: "Estas condiciones aplican cuando creas una cuenta en QRveo o contratas uno de sus planes.",
    sections: [
      {
        h: "El servicio",
        p: [
          "QRveo te permite subir videos de tus productos, generar un código QR para cada uno y que tus clientes los vean en su celular sin instalar una app ni registrarse.",
        ],
      },
      {
        h: "Prueba gratis",
        p: ["La prueba dura 30 días, no requiere tarjeta e incluye 5 GB de espacio. Al terminar, puedes contratar un plan anual."],
      },
      {
        h: "Planes y pagos",
        p: [
          "Los precios publicados están en pesos mexicanos e incluyen IVA. Los planes se pagan por año con tarjeta de crédito o débito, o por transferencia SPEI. Emitimos factura (CFDI) a solicitud.",
        ],
      },
      {
        h: "Si no renuevas",
        p: [
          "Al vencer tu plan ya no podrás subir ni editar videos, pero los códigos QR que ya imprimiste siguen funcionando para que tus clientes no se queden sin instructivo.",
        ],
      },
      {
        h: "Tu contenido",
        p: [
          "Eres responsable de tener los derechos de los videos que subes y de que su contenido sea legal. El QR complementa tu instructivo y tu garantía impresos; no los sustituye.",
        ],
      },
      {
        h: "Ley aplicable",
        p: [
          "Estas condiciones se rigen por las leyes de México. Como consumidor, también puedes acudir a la Procuraduría Federal del Consumidor (PROFECO).",
        ],
      },
    ],
  },
];
