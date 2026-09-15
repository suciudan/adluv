export type AdFormatKey = "image" | "video" | "carousel" | "leadgen" | "document" | "text" | "job" | "message" | "follow" | "unknown";

function normalizeAdFormatSource(format: string | null) {
  return (format ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getAdFormatKey(format: string | null): AdFormatKey {
  const value = normalizeAdFormatSource(format);

  if (!value) {
    return "unknown";
  }

  if (value.includes("carousel") || value.includes("carrusel") || value.includes("carrossel")) {
    return "carousel";
  }

  if (value.includes("lead")) {
    return "leadgen";
  }

  if (value.includes("job") || value.includes("empleo")) {
    return "job";
  }

  if (value.includes("message") || value.includes("inmail") || value.includes("mensaje")) {
    return "message";
  }

  if (value.includes("follow")) {
    return "follow";
  }

  if (value.includes("video") || value.includes("vdeo")) {
    return "video";
  }

  if (value.includes("document") || value.includes("documento") || value.includes("pdf")) {
    return "document";
  }

  if (value.includes("text") || value.includes("texto") || value.includes("texte") || value.includes("tekst")) {
    return "text";
  }

  if (
    value.includes("image") ||
    value.includes("imagen") ||
    value.includes("imagem") ||
    value.includes("single image")
  ) {
    return "image";
  }

  return "unknown";
}

export function getAdFormatLabel(format: string | null) {
  switch (getAdFormatKey(format)) {
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "carousel":
      return "Carousel";
    case "leadgen":
      return "Leadgen";
    case "document":
      return "Document";
    case "text":
      return "Text";
    case "job":
      return "Job";
    case "message":
      return "Message";
    case "follow":
      return "Follow Company";
    default:
      return format?.trim() || "Unknown";
  }
}
