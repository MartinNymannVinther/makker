"""
Billedgenerering via fal.ai.

Samme tanke som resten: app.py kender ikke fal. Den spørger bare om et
billede og får en sti tilbage.

fal taler ikke OpenAI-formatet for billeder — det er et almindeligt
HTTP-kald med en nøgle i headeren. Derfor står det her og ikke i PROVIDERS.

Billedet hentes ned og lægges i static/genereret/. Det koster lidt disk,
men gør at billedet stadig er der i morgen, at gemte samtaler ikke går i
stykker når fal rydder op, og at browseren aldrig selv taler med fal.
"""
import os
import uuid
import pathlib

import httpx

FAL_KEY = os.environ.get("FAL_KEY", "")
FAL_URL = "https://fal.run"

MAPPE = pathlib.Path("static/genereret")

# Timeout i sekunder. schnell er hurtig, dev tager længere.
TIMEOUT = 180


# --- Modeller. Tilføj/fjern frit. ----------------------------------------
# Nøglen er det navn UI'et viser. "sti" er fal's model-id.
MODELLER = {
    "FLUX schnell": {"sti": "fal-ai/flux/schnell", "trin": 4},
    "FLUX dev":     {"sti": "fal-ai/flux/dev",     "trin": 28},
}

# Hvad UI'et sender som størrelse → hvad fal kalder det.
STØRRELSER = {
    "bred":    "landscape_4_3",
    "høj":     "portrait_4_3",
    "kvadrat": "square_hd",
}


class BilledeFejl(Exception):
    """Fejl vi kan forklare brugeren i klar tekst."""


def tilgængelig() -> bool:
    """Uden nøgle viser vi slet ikke billedmodellerne. Samme princip som
    med Ollama: er den ikke der, findes den ikke i dropdownen."""
    return bool(FAL_KEY)


def _endelse(content_type: str) -> str:
    return {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
    }.get((content_type or "").lower(), ".jpg")


def generer(prompt: str, model_navn: str, størrelse: str = "bred") -> dict:
    """Prompt ind, gemt billede ud.

    Returnerer den form UI'et og den gemte samtale bruger:
        {"url", "prompt", "model", "bredde", "højde"}
    """
    prompt = (prompt or "").strip()
    if not prompt:
        raise BilledeFejl("Skriv hvad billedet skal forestille.")
    if not FAL_KEY:
        raise BilledeFejl("Der er ingen FAL_KEY i .env, så billeder er slået fra.")

    model = MODELLER.get(model_navn)
    if model is None:
        raise BilledeFejl(f"Ukendt billedmodel: {model_navn}")

    krop = {
        "prompt": prompt,
        "image_size": STØRRELSER.get(størrelse, STØRRELSER["bred"]),
        "num_images": 1,
        "num_inference_steps": model["trin"],
    }

    try:
        svar = httpx.post(
            f"{FAL_URL}/{model['sti']}",
            headers={"Authorization": f"Key {FAL_KEY}",
                     "Content-Type": "application/json"},
            json=krop,
            timeout=TIMEOUT,
        )
    except httpx.RequestError as e:
        raise BilledeFejl(f"Kunne ikke nå fal.ai: {e}")

    if svar.status_code == 401:
        raise BilledeFejl("fal.ai afviste nøglen. Tjek FAL_KEY i .env.")
    if svar.status_code >= 400:
        raise BilledeFejl(f"fal.ai svarede {svar.status_code}: {svar.text[:200]}")

    data = svar.json()
    billeder = data.get("images") or []
    if not billeder:
        raise BilledeFejl("fal.ai returnerede ingen billeder.")

    return _hent_hjem(billeder[0], prompt, model_navn, data)


def _hent_hjem(billede: dict, prompt: str, model_navn: str, data: dict) -> dict:
    """Hent billedet ned til os selv, så det ikke forsvinder igen."""
    kilde = billede.get("url")
    if not kilde:
        raise BilledeFejl("fal.ai returnerede et billede uden adresse.")

    try:
        hentet = httpx.get(kilde, timeout=TIMEOUT, follow_redirects=True)
        hentet.raise_for_status()
    except httpx.HTTPError as e:
        raise BilledeFejl(f"Billedet kunne ikke hentes ned: {e}")

    MAPPE.mkdir(parents=True, exist_ok=True)
    navn = uuid.uuid4().hex[:12] + _endelse(billede.get("content_type", ""))
    (MAPPE / navn).write_bytes(hentet.content)

    # fal markerer selv hvis sikkerhedsfilteret slog ud.
    flag = data.get("has_nsfw_concepts") or []

    return {
        "url": f"/static/genereret/{navn}",
        "prompt": prompt,
        "model": model_navn,
        "bredde": billede.get("width"),
        "højde": billede.get("height"),
        "markeret": bool(flag and flag[0]),
    }
