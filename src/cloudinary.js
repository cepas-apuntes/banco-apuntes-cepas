const CLOUD_NAME = "tfzktsxh";
const UPLOAD_PRESET = "p0j8jlhf";

export async function subirArchivoCloudinary(file, carpetaId) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", `banco-apuntes/${carpetaId}`);

  const esImagen = file.type.startsWith("image/");
  const tipo = esImagen ? "image" : "raw";

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${tipo}/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Error al subir a Cloudinary");
  }

  const data = await res.json();
  return { url: data.secure_url, publicId: data.public_id };
}
