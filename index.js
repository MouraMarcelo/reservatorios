import * as dfd from "danfojs-node";

// Entrada do usuário
const dam_data = {
  Max_Volume: 173000,
  Min_Volume: 0,
  Tot_Area: 40520.46,
  M_Infiltration: 0.1,
  Q_Reg: 0.034,
  Min_Vol_Observed: 0,
  Q_Cap: 104,
};

let evaporacao = new dfd.Series([
  130.06, 141.88, 130.65, 115.87, 104.0, 96.0, 116.02, 159.6, 169.76, 204.8,
  110.62, 120.58,
  // 130.06
]);

// Resposta da api
let descarga = await dfd
  .readJSON("./api/data.json")
  .then((df) => {
    df.setIndex({ column: "Meses", drop: true, inplace: true });

    let qd = df["Q_defluente"];
    let ds = df["Dias"];

    let new_col = qd.mul(ds.mul(60 * 60 * 24)); // Q defluente m³/mês

    df.addColumn("Q_deluente_mes", new_col, { inplace: true });

    return df;
  })
  .catch((err) => {
    console.log(err);
  });

let captacao = new dfd.DataFrame(
  {
    Dias: descarga["Dias"].values,
    Temp_cap_dia: [24, 24, 24, 24, 24, 0, 0, 0, 0, 24, 24, 24],
  },
  { index: descarga.index },
);

let tc = captacao["Temp_cap_dia"];
let ds = captacao["Dias"];

let tct = tc.mul(ds); // T capitação hrs/mês
let qct = tct.mul((dam_data.Q_Cap * 60 * 60) / 1000); // Q capitado m³/mês

captacao.addColumn("Temp_cap_mes", tct, { inplace: true });
captacao.addColumn("Q_cap_total", qct, { inplace: true });

let entrada = new dfd.DataFrame(
  {
    Dias: descarga["Dias"].values,
    QMLT: descarga["QMLT"].values,
  },
  { index: descarga.index },
);

let em = entrada.QMLT.mul(entrada.Dias.mul(60 * 60 * 24));

entrada.addColumn("Entrada_media", em, { inplace: true });

let saida = new dfd.DataFrame(
  {
    Dias: descarga["Dias"].values,
    Q_remanescente: descarga["Q_deluente_mes"].values,
    Captacao: qct.values,
  },
  { index: descarga.index },
);

let ic = ds.mul(
  (60 * 60 * 24 * dam_data.Tot_Area * dam_data.M_Infiltration) / 10000 / 1000,
);
let ev = evaporacao.mul(dam_data.Tot_Area / 1000);

saida.addColumn("Infiltracao", ic, { inplace: true });
saida.addColumn("Evaporacao", ev, { inplace: true });

let vol_temp = dam_data.Max_Volume;
let vol_prov = [];
let vol_final = [];
let CHECK = [];

for (let i = 0; i < descarga.shape[0]; i++) {
  let soma_saida =
    saida.Q_remanescente.values[i] +
    saida.Infiltracao.values[i] +
    saida.Evaporacao.values[i] +
    saida.Captacao.values[i];

  let value = vol_temp + em.values[i] - soma_saida;

  if (value <= 0) {
    value =
      vol_temp +
      em.values[i] -
      saida.Q_remanescente.values[i] -
      saida.Captacao.values[i];
  }

  if (soma_saida > vol_temp + em.values[i]) {
    CHECK.push("PROBLEMA");
  } else {
    CHECK.push("OK");
  }

  if (value > dam_data.Max_Volume) {
    vol_temp = dam_data.Max_Volume;
  } else if (value < 0) {
    vol_temp = 0;
  } else {
    vol_temp = value;
  }

  vol_final.push(value);
  vol_prov.push(vol_temp);
}

let checagem = new dfd.DataFrame(
  {
    Volume_Final: vol_final,
    Volume_Provavel: vol_prov,
    CHECK: CHECK,
  },
  { index: descarga.index },
);

const response = {
  "Descarga Barragem": dfd.toJSON(descarga, { format: "row" }),
  "Captação Barragem": dfd.toJSON(captacao, { format: "row" }),
  "Entrada Barragem": dfd.toJSON(entrada, { format: "row" }),
  "Saída Barragem": dfd.toJSON(saida, { format: "row" }),
  "Checagem": dfd.toJSON(checagem, { format: "row" }),
};

console.log(response);
