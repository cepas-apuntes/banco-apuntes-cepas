// src/cloudinary.js
// Sube archivos a Cloudinary usando "unsigned upload" (subida sin clave secreta).
// Esto es seguro para un sitio público: Cloudinary permite configurar un "upload preset"
// que solo acepta los tipos de archivo y tamaños que vos definís.
//
// Reemplazá estos dos valores por los de tu cuenta de Cloudinary:
//   CLOUD_NAME   → lo ves en el dashboard de Cloudinary, arriba a la izquierda
//   UPLOAD_PRESET → lo creás vos en Settings → Upload → Add upload preset (ver guía Parte 2)

const CLOUD_NAME = "TU_CLOUD_NAME";
const UPLOAD_PRESET = "TU_UPLOAD_PRESET";

/**
 * Sube un archivo a Cloudinary y devuelve la URL pública.
 * @param {File} file - El archivo a subir
 * @param {string} carpetaId - Identificador de la carpeta (curso + materia) para organizar
 * @returns {Promise<{url: string, publicId: string}>}
 */
export async function subirArchivoCloudinary(file, carpetaId) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", `banco-apuntes/${carpetaId}`);

  // Cloudinary tiene endpoints distintos para imágenes y archivos "raw" (PDF, Word, etc.)
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

/**
 * Elimina un archivo de Cloudinary.
 * IMPORTANTE: la eliminación real desde el cliente sin clave secreta no es posible
 * en Cloudinary (es una limitación de seguridad del servicio). Lo que hacemos es
 * eliminar el registro de Firestore para que deje de aparecer en el sitio.
 * Para borrado físico del archivo en Cloudinary, el admin puede hacerlo manualmente
 * desde el Media Library de Cloudinary (console.cloudinary.com).
 */
export function notaEliminacion() {
  // Ver comentario arriba. El archivo queda en Cloudinary pero invisible en el sitio.
}
