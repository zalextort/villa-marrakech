// Vacances scolaires françaises (zone B), lues dans le calendrier officiel de l'Éducation nationale.
// Les dates de l'API sont des instants UTC : on les ramène à la date de Paris.
// Période = [premier jour de vacances, jour de la reprise), comme les séjours.
import { useEffect, useMemo, useState } from 'react';
import { addDays } from './dates';

const API =
  'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records' +
  '?select=description,start_date,end_date&where=zones%3D%22Zone%20B%22%20and%20end_date%3E%3D%222024-01-01%22' +
  '&group_by=description,start_date,end_date&order_by=start_date&limit=100';
const CACHE = 'vacances-zone-b';

const SHORT: [RegExp, string][] = [
  [/toussaint/i, 'Toussaint'],
  [/no[eë]l/i, 'Noël'],
  [/hiver/i, 'Hiver'],
  [/printemps/i, 'Printemps'],
  [/ascension/i, 'Ascension'],
  [/[ée]t[ée]/i, 'Été'],
];

const parisDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' });
const toParis = (iso: string) => parisDate.format(new Date(iso));

/** Nom court des vacances pour chaque jour concerné (« AAAA-MM-JJ » → « Toussaint »). */
export type HolidayIndex = Map<string, string>;

function index(records: { description: string; start_date: string; end_date: string }[]): HolidayIndex {
  const map: HolidayIndex = new Map();
  for (const r of records) {
    const name = SHORT.find(([re]) => re.test(r.description))?.[1] ?? r.description;
    const start = toParis(r.start_date);
    // Certaines périodes ont la même date de début et de fin (pont, début d'été) : au moins un jour
    const end = toParis(r.end_date) > start ? toParis(r.end_date) : addDays(start, 1);
    for (let d = start; d < end; d = addDays(d, 1)) map.set(d, name);
  }
  return map;
}

export function useHolidays(): HolidayIndex {
  const [records, setRecords] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CACHE) ?? '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    fetch(API)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        setRecords(data.results);
        try {
          localStorage.setItem(CACHE, JSON.stringify(data.results));
        } catch {
          // stockage indisponible : on garde simplement les données en mémoire
        }
      })
      .catch(() => {
        // hors ligne ou API indisponible : on affiche la dernière version connue
      });
  }, []);

  return useMemo(() => index(records), [records]);
}
