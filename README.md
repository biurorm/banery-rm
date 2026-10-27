# Banery RM

PWA banerów i tabliczek na ofertach (zbudowana 27.10.2026). Rodzaje: 🧊 baner 3D, 🔘 baner z oczkami, 🪧 baner na stelażu, 🏷️ tabliczka.

- **📍 Wiszą:** kafle (wisi, do naprawy, do sprawdzenia = bez objazdu ponad 30 dni, stała `DAWNO`), szukanie, filtry rodzajów. Dodanie: nieruchomość, adres, gdzie dokładnie wisi, rodzaj, kto montował (ktoś z zespołu albo spoza biura), data montażu, ile sztuk, GPS z telefonu („jestem przy banerze”), uwagi. Karta: 🧭 Nawiguj, ✏️ Zmień, ✅ Naprawiony, ⬇️ Zdjęty.
- **🚗 Objazd:** przy każdym banerze ✅ Wisi, OK / ⚠️ Uszkodzony / ❌ Nie ma go + uwagi, 🗺️ trasa w Mapach Google (do 10 niesprawdzonych), szkic objazdu zostaje w telefonie, gdy aplikacja się zamknie. Zapis: stan i data przy banerach, wpis w historii objazdów, a przy NOWYM problemie zadanie w Zadaniach RM (dla montującego z zespołu, inaczej dla robiącego objazd, termin +3 dni).
- **📦 Archiwum:** zdjęte banery z powodem (sprzedaż, wynajęcie, wycofanie oferty, inny), datą, kto zdjął, ile dni wisiał. „Przywróć” przy pomyłce, usunięcie na stałe tylko menedżer.

Dane w bazie Zadań RM (Supabase `zadania-rm`), to samo logowanie, tabele `banery` i `banery_objazdy` + funkcja `banery_objazd` z `setup.sql`. Tryb próbny: `index.html?proba`.
Wydanie: podbij `WERSJA` w app.js, `?v=` w index.html i `CACHE` w sw.js, potem `bash publikuj.sh "opis"`.
