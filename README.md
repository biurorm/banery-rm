# Banery RM

PWA banerów i tabliczek: na ofertach i marketingowych w stałych miejscach (v1 27.10.2026, v2 28.10.2026). Rodzaje: 🧊 baner 3D, 🔘 baner z oczkami, 🪧 baner na stelażu, 🏷️ tabliczka.

- **📍 Wiszą:** kafle (wisi, do naprawy, do sprawdzenia = bez objazdu ponad 30 dni, stała `DAWNO`), szukanie, filtry rodzajów. Dodanie: nieruchomość, adres, gdzie dokładnie wisi, rodzaj, kto montował (ktoś z zespołu albo spoza biura), data montażu, ile sztuk, GPS z telefonu („jestem przy banerze”), uwagi. Karta: 🧭 Nawiguj, ✏️ Zmień, ✅ Naprawiony, ⬇️ Zdjęty.
- **🏡/📣 Typ:** oferta (nieruchomość) albo marketingowy (miejsce, np. płot przy markecie); filtr na liście, przy zdjęciu marketingowego powód „koniec umowy na miejsce”.
- **📷 Zdjęcia:** przy dodaniu i zmianie baneru oraz przy każdym banerze w objeździe; prywatny koszyk Storage `banery`, folder = id baneru, w karcie ostatnie zdjęcie, w historii objazdów każde.
- **🗺️ Trasa:** najkrótsza pętla biuro → banery → biuro (OSRM trip, bez sieci szacunek po prostej ×1,3), banery bez GPS z adresu (Photon, pamięć w telefonie), ✕ usuwa punkt z trasy (zostaje na liście), km zaokrąglone w górę do Kilometrówki + 📋 opis przejazdu, link Map Google w częściach po 9 przystanków. Lista objazdu idzie w kolejności trasy.
- **🚗 Objazd:** przy każdym banerze ✅ Wisi, OK / ⚠️ Uszkodzony / ❌ Nie ma go + uwagi + zdjęcie, szkic objazdu zostaje w telefonie, gdy aplikacja się zamknie. Zapis: stan i data przy banerach, wpis w historii objazdów, a przy NOWYM problemie zadanie w Zadaniach RM (dla montującego z zespołu, inaczej dla robiącego objazd, termin +3 dni).
- **📦 Archiwum:** zdjęte banery z powodem (sprzedaż, wynajęcie, wycofanie oferty, inny), datą, kto zdjął, ile dni wisiał. „Przywróć” przy pomyłce, usunięcie na stałe tylko menedżer.

Dane w bazie Zadań RM (Supabase `zadania-rm`), to samo logowanie, tabele `banery` i `banery_objazdy` + funkcja `banery_objazd` z `setup.sql`, potem RAZ `setup-v2.sql` (typ, zdjęcia, koszyk `banery`, objazd ze zdjęciem). Tryb próbny: `index.html?proba`.
Wydanie: podbij `WERSJA` w app.js, `?v=` w index.html i `CACHE` w sw.js, potem `bash publikuj.sh "opis"`.
