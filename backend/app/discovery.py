"""Rule-based parser for CineFind natural-language discovery requests."""
import re

from .schemas import DiscoveryFilters, DiscoveryParseResponse

GENRE_RULES = {
    "Science Fiction": (r"science[ -]?fiction", r"\bsci[ -]?fi\b"),
    "Thriller": (r"\bthrillers?\b", r"\bsuspense\b"),
    "Mystery": (r"\bmysteries\b", r"\bmystery\b"),
    "Horror": (r"\bhorror\b", r"\bscary\b"),
    "Comedy": (r"\bcomed(?:y|ies)\b", r"\bfunn?y\b", r"\bhumou?r(?:ous)?\b"),
    "Action": (r"\baction\b",), "Adventure": (r"\badventure\b",),
    "Romance": (r"\bromance\b", r"\bromantic\b", r"\blove stor(?:y|ies)\b"),
    "Drama": (r"\bdrama\b", r"\bdramatic\b"),
    "Animation": (r"\banimat(?:ed|ion)\b",),
    "Family": (r"\bfamily\b", r"\bfamily[ -]friendly\b"),
    "Crime": (r"\bcrime\b", r"\bcriminal\b"),
    "Fantasy": (r"\bfantasy\b", r"\bmagical\b"),
    "Documentary": (r"\bdocumentar(?:y|ies)\b",),
    "History": (r"\bhistorical\b", r"\bhistory\b"),
    "War": (r"\bwar\b",), "Western": (r"\bwestern\b",),
    "Music": (r"\bmusical\b", r"\bmusic\b"),
}
LANGUAGES = {
    "english": "en", "hindi": "hi", "telugu": "te", "tamil": "ta",
    "malayalam": "ml", "kannada": "kn", "bengali": "bn", "marathi": "mr",
    "punjabi": "pa", "korean": "ko", "japanese": "ja", "spanish": "es",
    "french": "fr", "german": "de", "chinese": "zh",
}
NUMBER_WORDS = {"one": 1, "a": 1, "an": 1, "two": 2, "three": 3, "four": 4, "five": 5}


def number(value: str) -> float:
    return float(NUMBER_WORDS.get(value, value))


def parse_discovery_query(query: str) -> DiscoveryParseResponse:
    text = query.strip().lower()
    filters: dict = {}
    recognized: list[str] = []
    notices: list[str] = []

    if re.search(r"\b(?:tv|television)\b|\bseries\b|\bweb series\b|\bshows\b|\b(?:a|the|some)\s+show\b", text):
        filters["content_type"] = "tv"
        recognized.append("TV shows")
    elif re.search(r"\b(movie|movies|film|films|cinema)\b", text):
        filters["content_type"] = "movie"
        recognized.append("movies")

    genres = [name for name, patterns in GENRE_RULES.items() if any(re.search(pattern, text) for pattern in patterns)]
    if genres:
        filters["genres"] = genres
        recognized.extend(genres)
    if re.search(r"\bfamily[ -]friendly\b", text):
        notices.append("Family-friendly certification cannot be verified from this metadata; Family is used as a broad genre guide.")
    if re.search(r"\b(highly rated|top rated|best rated|best reviewed)\b", text):
        filters["sort_by"] = "rating"
        recognized.append("highly rated first")
    elif re.search(r"\b(popular|trending|most popular)\b", text):
        filters["sort_by"] = "popularity"
        recognized.append("popular first")

    between = re.search(r"\bbetween\s+(19\d{2}|20\d{2})\s+and\s+(19\d{2}|20\d{2})\b", text)
    if between:
        filters["year_from"], filters["year_to"] = int(between.group(1)), int(between.group(2))
        recognized.append(f"years {filters['year_from']}–{filters['year_to']}")
    else:
        after = re.search(r"\b(?:after|later than)\s+(19\d{2}|20\d{2})\b", text)
        since = re.search(r"\b(?:since|from)\s+(19\d{2}|20\d{2})\b", text)
        before = re.search(r"\b(?:before|earlier than)\s+(19\d{2}|20\d{2})\b", text)
        by = re.search(r"\bby\s+(19\d{2}|20\d{2})\b", text)
        exact = re.search(r"\b(?:released|in)\s+(19\d{2}|20\d{2})\b", text)
        if after: filters["year_from"] = int(after.group(1)) + 1
        elif since: filters["year_from"] = int(since.group(1))
        if before: filters["year_to"] = int(before.group(1)) - 1
        elif by: filters["year_to"] = int(by.group(1))
        if not any((after, since, before, by)) and exact:
            filters["year_from"] = filters["year_to"] = int(exact.group(1))
        if "year_from" in filters or "year_to" in filters:
            recognized.append("release year")

    rating_num = r"(\d(?:\.\d)?)\b(?!\s*(?:hours?|hrs?|minutes?|mins?|seasons?|episodes?))"
    above = re.search(r"\b(?:rating\s+(?:of\s+)?(?:above|over|greater than|higher than)|rated\s+(?:above|over|greater than|higher than)|(?:above|over|greater than|higher than)\s+(?:a\s+)?rating(?:\s+of)?)\s+" + rating_num, text)
    at_least = re.search(r"\b(?:minimum rating(?: of)?|rating\s+(?:of\s+)?at least|rated at least)\s+" + rating_num, text)
    below = re.search(r"\b(?:rating\s+(?:below|under|less than|lower than)|rated\s+(?:below|under|less than|lower than)|(?:below|under|less than|lower than)\s+(?:a\s+)?rating(?:\s+of)?)\s+" + rating_num, text)
    if above:
        filters["min_rating"], filters["rating_exclusive"] = float(above.group(1)), True
        recognized.append(f"rating above {filters['min_rating']:g}")
    elif at_least:
        filters["min_rating"] = float(at_least.group(1))
        recognized.append(f"rating at least {filters['min_rating']:g}")
    if below:
        filters["max_rating"], filters["rating_max_exclusive"] = float(below.group(1)), True
        recognized.append(f"rating below {filters['max_rating']:g}")

    runtime = re.search(r"\b(?:under|below|less than|shorter than|no more than|up to)\s+(one|two|three|four|five|\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?)\b", text)
    if runtime:
        value = number(runtime.group(1))
        filters["max_runtime_minutes"] = round(value * (60 if runtime.group(2).startswith(("hour", "hr")) else 1))
        filters["runtime_exclusive"] = runtime.group(0).startswith(("under", "below", "less than", "shorter than"))
        recognized.append(f"runtime up to {filters['max_runtime_minutes']} minutes")
    elif "short" in text and filters.get("content_type") == "tv":
        filters["max_runtime_minutes"] = 30
        recognized.append("short episodes (30 minutes or less)")

    multiple = re.search(r"\bmultiple seasons\b", text)
    at_seasons = re.search(r"\b(?:at least|minimum of)\s+(one|two|three|four|five|\d+)\s+seasons?\b", text)
    exact_seasons = re.search(r"\b(?:with|has|having)\s+(one|two|three|four|five|\d+)\s+seasons?\b", text)
    if multiple:
        filters["min_seasons"], filters["content_type"] = 2, "tv"
        recognized.append("at least 2 seasons")
    elif at_seasons:
        filters["min_seasons"], filters["content_type"] = int(number(at_seasons.group(1))), "tv"
        recognized.append(f"at least {filters['min_seasons']} seasons")
    elif exact_seasons:
        count = int(number(exact_seasons.group(1)))
        filters["min_seasons"], filters["max_seasons"], filters["content_type"] = count, count, "tv"
        recognized.append(f"exactly {count} seasons")

    for word, language in LANGUAGES.items():
        if re.search(rf"\b{word}\b", text):
            filters["language"] = language
            recognized.append(f"Original language: {word.title()}")
            break
    if re.search(r"\b(indian|india)\b", text):
        filters["region"] = "IN"
        if not any("India" in item for item in recognized): recognized.append("India region")
    elif re.search(r"\b(american|usa|united states)\b", text):
        filters["region"] = "US"
        recognized.append("United States region")
    elif re.search(r"\b(british|uk|united kingdom)\b", text):
        filters["region"] = "GB"
        recognized.append("United Kingdom region")
    elif re.search(r"\bsouth korean\b", text):
        filters["region"] = "KR"
        recognized.append("South Korea region")
    elif re.search(r"\bjapanese films?\b", text):
        filters["region"] = "JP"
        recognized.append("Japan region")

    if not filters:
        return DiscoveryParseResponse(
            filters=DiscoveryFilters(), recognized_filters=[], notices=notices,
            clarification="No specific filters were detected, so CineFind will search the phrase as a title or keyword.",
            keyword_query=query.strip(),
        )
    return DiscoveryParseResponse(filters=DiscoveryFilters(**filters), recognized_filters=recognized, notices=notices)
