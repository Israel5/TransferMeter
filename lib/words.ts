// The customer-facing vocabulary. Every string a customer can read lives here,
// so a quote reads naturally in their language rather than translated-sounding.
import type { Lang } from "./types";

export type Words = {
  [k: string]: [string, string] | string;
} & {
  no: string; noShort: string; at: string; leave: string;
  startPoint: string; endPoint: string;
  legs: [string, string]; oneway: string;
  pax: string; gear: string; bags: string;
  out: string; ret: string; leg: string; total: string; note: string;
};

export const WORDS: Record<Lang, Words> = {
  pt:{driven:"no total",adults:["adulto","adultos"],children:["criança","crianças"],infants:["bebê","bebês"],
      infantSeat:["bebê conforto","bebês conforto"],carSeat:["cadeirinha","cadeirinhas"],booster:["booster","boosters"],
      checked:["mala","malas"],carry:["bagagem de mão","bagagens de mão"],backpack:["mochila","mochilas"],
      stroller:["carrinho de bebê","carrinhos de bebê"],crib:["berço portátil","berços portáteis"],other:["item","itens"],
      pax:"Passageiros",gear:"Cadeirinhas",bags:"Bagagem",
      startPoint:"Ponto de partida",endPoint:"Ponto de chegada",no:"Orçamento nº",noShort:"Nº",at:"às",leave:"Sair de casa",
      legs:["trecho","trechos"],oneway:"só ida",
      out:"IDA",ret:"VOLTA",leg:"TRECHO",total:"TOTAL",
      note:"O valor já inclui a ida até você e a volta. Válido por 7 dias."},
  en:{driven:"driven",adults:["adult","adults"],children:["child","children"],infants:["baby","babies"],
      infantSeat:["infant seat","infant seats"],carSeat:["car seat","car seats"],booster:["booster","boosters"],
      checked:["suitcase","suitcases"],carry:["carry-on","carry-ons"],backpack:["backpack","backpacks"],
      stroller:["stroller","strollers"],crib:["travel crib","travel cribs"],other:["item","items"],
      pax:"Passengers",gear:"Child seats",bags:"Luggage",
      startPoint:"Starting point",endPoint:"End point",no:"Quote #",noShort:"No.",at:"at",leave:"Leave home",
      legs:["leg","legs"],oneway:"one way",
      out:"OUTBOUND",ret:"RETURN",leg:"LEG",total:"TOTAL",
      note:"Price includes collecting you and the return trip. Valid for 7 days."},
  fr:{driven:"au total",adults:["adulte","adultes"],children:["enfant","enfants"],infants:["bébé","bébés"],
      infantSeat:["siège bébé","sièges bébé"],carSeat:["siège d'auto","sièges d'auto"],booster:["siège d'appoint","sièges d'appoint"],
      checked:["valise","valises"],carry:["bagage à main","bagages à main"],backpack:["sac à dos","sacs à dos"],
      stroller:["poussette","poussettes"],crib:["lit parapluie","lits parapluie"],other:["article","articles"],
      pax:"Passagers",gear:"Sièges enfant",bags:"Bagages",
      startPoint:"Point de départ",endPoint:"Point d'arrivée",no:"Devis nº",noShort:"Nº",at:"à",leave:"Départ de la maison",
      legs:["trajet","trajets"],oneway:"aller simple",
      out:"ALLER",ret:"RETOUR",leg:"TRAJET",total:"TOTAL",
      note:"Le prix comprend la prise en charge et le retour. Valide 7 jours."}
};

export const wordsFor = (lang: Lang | undefined): Words => WORDS[lang ?? "pt"] ?? WORDS.pt;
