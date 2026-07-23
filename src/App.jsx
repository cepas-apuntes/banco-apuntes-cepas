import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Home, FolderOpen, HelpCircle, ChevronLeft, Upload, FileText, Trash2, X,
  Lock, Unlock, AlertCircle, CheckCircle2, Search, BookOpen, MessageCircle, Phone,
} from "lucide-react";
import {
  collection, query, where, orderBy, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { subirArchivoCloudinary } from "./cloudinary";

/* ============================================================
   BANCO DE APUNTES DIGITALES — CEPAS
   Firestore (lista de archivos) + Cloudinary (archivos físicos)
   ============================================================ */

// ---------- DATOS ----------

const MATERIAS_BASE = [
  "Prácticas del Lenguaje", "Matemática", "Físico-Química",
  "Geografía", "Historia", "Biología", "Informática", "Construcción de Ciudadanía",
];

const DIVISIONES = ["A", "B", "C", "D", "E", "F"];

const cursosCicloBasico = [];
[1, 2, 3].forEach((anio) => {
  DIVISIONES.forEach((div) => {
    const arteOMusica = anio === 2 ? "Música" : "Arte";
    cursosCicloBasico.push({
      id: `${anio}${div}`,
      nombre: `${anio}°${div}`,
      anio,
      ciclo: "basico",
      materias: [...MATERIAS_BASE, arteOMusica].map((m) => ({ nombre: m })),
    });
  });
});

const FORMACION_COMUN = [
  "Arte", "Biología", "Educación Física", "Filosofía", "Geografía", "Historia",
  "Inglés", "Introducción a la Física", "Introducción a la Química", "Literatura",
  "Matemática", "Política y Ciudadanía", "Salud y Adolescencia", "NTICX", "Trabajo y Ciudadanía",
];

const ORIENTACIONES = {
  naturales: {
    nombre: "Ciencias Naturales", turnos: ["Mañana", "Tarde"],
    especificas: {
      4: ["Introducción a la Química"],
      5: ["Fundamentos de Química", "Física", "Biología", "Ciencias de la Tierra"],
      6: ["Química del Carbono", "Biología, genética y sociedad", "Física clásica y moderna", "Ambiente, desarrollo y sociedad"],
    },
  },
  sociales: {
    nombre: "Ciencias Sociales", turnos: ["Mañana", "Tarde"],
    especificas: {
      4: ["Psicología"],
      5: ["Comunicación, cultura y sociedad", "Economía Política", "Sociología"],
      6: ["Historia", "Geografía", "Proyecto de investigación en Ciencias Sociales"],
    },
  },
  economia: {
    nombre: "Economía y Administración", turnos: ["Mañana"],
    especificas: {
      4: ["Sistemas de información contable", "Teoría de las Organizaciones"],
      5: ["Elementos de micro y macroeconomía", "Derecho", "Sistemas de información contable", "Gestión Organizacional"],
      6: ["Economía Política", "Proyectos Organizacionales"],
    },
  },
  arte: {
    nombre: "Arte (Artes Visuales)", turnos: ["Tarde"],
    especificas: {
      4: ["Producción y análisis de la imagen"],
      5: ["Lenguaje Complementario", "Imagen y nuevos medios", "Imagen y procedimientos constructivos"],
      6: ["Historia", "Arte (Lenguaje Complementario)", "Proyecto de producción en artes visuales"],
    },
  },
};

const cursosCicloSuperior = [];
[4, 5, 6].forEach((anio) => {
  Object.entries(ORIENTACIONES).forEach(([key, orient]) => {
    orient.turnos.forEach((turno) => {
      cursosCicloSuperior.push({
        id: `${anio}-${key}-${turno}`,
        nombre: `${anio}° ${orient.nombre}`,
        sub: `Turno ${turno}`,
        anio,
        ciclo: "superior",
        materias: [
          ...FORMACION_COMUN.map((m) => ({ nombre: m })),
          ...orient.especificas[anio].map((m) => ({ nombre: m, especifica: true })),
        ],
      });
    });
  });
});

const TODOS_LOS_CURSOS = [...cursosCicloBasico, ...cursosCicloSuperior];

function agruparPorAnio(cursos) {
  const grupos = {};
  cursos.forEach((c) => { if (!grupos[c.anio]) grupos[c.anio] = []; grupos[c.anio].push(c); });
  return grupos;
}

// ---------- CONFIG ----------
const ADMIN_KEY = "CEPAS2026"; // Cambiá esto antes de publicar
const ADMIN_FLAG = "cepas_admin_unlocked";
const EXT_OK = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
const MAX_MB = 8;

function extOk(name) { return EXT_OK.some((e) => name.toLowerCase().endsWith(e)); }
function icono(name) {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "PDF";
  if (n.endsWith(".doc") || n.endsWith(".docx")) return "DOC";
  return "IMG";
}
function fmtBytes(b) {
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(0) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}
function slug(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch {} }

// ============================================================
// APP
// ============================================================

export default function App() {
  const [vista, setVista] = useState("inicio");
  const [cursoActivo, setCursoActivo] = useState(null);
  const [materiaActiva, setMateriaActiva] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [toast, setToast] = useState(null);

  // Restaurar posición desde el hash de la URL al cargar
  useEffect(() => {
    if (lsGet(ADMIN_FLAG) === "true") setIsAdmin(true);
    const hash = window.location.hash.replace("#", "");
    if (!hash) return;
    try {
      const estado = JSON.parse(decodeURIComponent(hash));
      if (estado.vista) setVista(estado.vista);
      if (estado.curso) setCursoActivo(estado.curso);
      if (estado.materia) setMateriaActiva(estado.materia);
    } catch {}
  }, []);

  // Guardar posición en el hash de la URL cada vez que cambia
  useEffect(() => {
    const estado = { vista };
    if (cursoActivo) estado.curso = cursoActivo;
    if (materiaActiva) estado.materia = materiaActiva;
    window.location.hash = encodeURIComponent(JSON.stringify(estado));
  }, [vista, cursoActivo, materiaActiva]);

  const toastMsg = useCallback((msg, tipo = "ok") => {
    setToast({ msg, tipo });
    setTimeout(() => setToast(null), 3200);
  }, []);

  const irACurso = (c) => { setCursoActivo(c); setVista("curso"); window.scrollTo(0, 0); };
  const irAMateria = (m) => { setMateriaActiva(m); setVista("materia"); window.scrollTo(0, 0); };
  const volver = () => {
    if (vista === "materia") { setVista("curso"); setMateriaActiva(null); }
    else { setVista("anios"); setCursoActivo(null); }
    window.scrollTo(0, 0);
  };
  const desactivarAdmin = () => { setIsAdmin(false); lsDel(ADMIN_FLAG); toastMsg("Modo administrador desactivado", "info"); };

  return (
    <div style={s.page}>
      <style>{css}</style>
      <TopNav vista={vista} setVista={setVista} isAdmin={isAdmin}
        onAdmin={() => isAdmin ? desactivarAdmin() : setShowAdmin(true)} />
      <main style={s.main}>
        {vista === "inicio" && <VistaInicio onAnios={() => setVista("anios")} />}
        {vista === "anios" && <VistaAnios onCurso={irACurso} />}
        {vista === "dudas" && <VistaDudas />}
        {vista === "curso" && cursoActivo && <VistaCurso curso={cursoActivo} onVolver={volver} onMateria={irAMateria} />}
        {vista === "materia" && cursoActivo && materiaActiva && (
          <VistaMateria curso={cursoActivo} materia={materiaActiva} onVolver={volver} isAdmin={isAdmin} toast={toastMsg} />
        )}
      </main>
      <footer style={s.footer}>
        Banco de Apuntes Digitales · CEPAS — Centro de Estudiantes, Escuela "Paula Albarracín de Sarmiento"
      </footer>
      {showAdmin && <AdminModal onClose={() => setShowAdmin(false)} onOk={() => { setIsAdmin(true); setShowAdmin(false); toastMsg("Modo administrador activado"); }} />}
      {toast && <Toast msg={toast.msg} tipo={toast.tipo} />}
    </div>
  );
}

// ---------- NAV ----------

function TopNav({ vista, setVista, isAdmin, onAdmin }) {
  const active = (k) => vista === k || (vista === "curso" && k === "anios") || (vista === "materia" && k === "anios");
  const navItem = (k, label, Icon) => (
    <button key={k} onClick={() => setVista(k)} style={{ ...s.navBtn, ...(active(k) ? s.navActive : {}) }}>
      <Icon size={17} strokeWidth={2.2} /><span>{label}</span>
    </button>
  );
  return (
    <header style={s.header}>
      <div style={s.headerInner}>
        <div>
          <div style={s.brand}>CEPAS</div>
          <div style={s.brandSub}>Centro de Estudiantes · Escuela "Paula Albarracín de Sarmiento"</div>
        </div>
        <nav style={s.nav}>
          {navItem("inicio", "Inicio", Home)}
          {navItem("anios", "Años", FolderOpen)}
          {navItem("dudas", "Dudas", HelpCircle)}
          <button onClick={onAdmin} style={{ ...s.navBtn, ...s.adminBtn, ...(isAdmin ? s.adminOn : {}) }}
            title={isAdmin ? "Salir del modo admin" : "Admin"}>
            {isAdmin ? <Unlock size={16} /> : <Lock size={16} />}
          </button>
        </nav>
      </div>
    </header>
  );
}

// ---------- INICIO ----------

function VistaInicio({ onAnios }) {
  return (
    <div style={{ textAlign: "center" }}>
      <h1 style={s.titulo}>Banco de Apuntes Digitales</h1>
      <p style={s.lead}>Un archivero compartido entre todos los y las estudiantes: resúmenes, guías, líneas de tiempo, exámenes anteriores y apuntes de clase, ordenados por curso y materia.</p>
      <div style={s.cards}>
        {[
          [BookOpen, "¿Para qué sirve?", "Para que el material de cada generación no se pierda. Lo que subís hoy le sirve a quien curse esa materia el año que viene."],
          [Upload, "¿Qué puedo subir?", "Resúmenes, guías, líneas de tiempo, exámenes anteriores, fotocopias y apuntes. Solo en formato PDF, Word o JPG/PNG."],
          [Search, "¿Cómo lo encuentro?", "Entrá en Años, elegí tu curso y después la materia que buscás. Ahí están todos los archivos disponibles."],
        ].map(([Icon, t, d]) => (
          <div key={t} style={s.card}>
            <Icon size={22} strokeWidth={1.8} color={c.azulOscuro} />
            <h3 style={s.cardTitulo}>{t}</h3>
            <p style={s.cardTexto}>{d}</p>
          </div>
        ))}
      </div>
      <button style={s.cta} onClick={onAnios}><FolderOpen size={18} /> Ver todos los cursos</button>
      <div style={s.nota}><AlertCircle size={15} color={c.azulOscuro} /><span>Cualquiera con el link puede ver y subir archivos. No subas datos personales ni nada que no sea material de estudio.</span></div>
    </div>
  );
}

// ---------- AÑOS ----------

function VistaAnios({ onCurso }) {
  const grupos = agruparPorAnio(TODOS_LOS_CURSOS);
  return (
    <div>
      <h2 style={s.h2}>Años y orientaciones</h2>
      <p style={s.sub}>Elegí tu curso. En 4°, 5° y 6° las materias dependen de la orientación y el turno.</p>
      {[1,2,3,4,5,6].map((anio) => (
        <section key={anio} style={{ marginBottom: 34 }}>
          <h3 style={s.anioTitulo}>
            {anio}° año
            <span style={s.tag}>{anio <= 3 ? "Ciclo Básico" : "Ciclo Superior · por orientación"}</span>
          </h3>
          <div style={s.grid}>
            {grupos[anio].map((curso) => (
              <button key={curso.id} style={s.carpeta} onClick={() => onCurso(curso)}>
                <div style={s.solapa} />
                <div style={s.carpetaCuerpo}>
                  <div style={s.carpetaNombre}>{curso.nombre}</div>
                  {curso.sub && <div style={s.carpetaSub}>{curso.sub}</div>}
                  <div style={s.carpetaMeta}>{curso.materias.length} materias</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------- CURSO ----------

function VistaCurso({ curso, onVolver, onMateria }) {
  return (
    <div>
      <Volver onClick={onVolver} label="Volver a Años" />
      <h2 style={s.h2}>{curso.nombre}</h2>
      {curso.sub && <p style={s.sub}>{curso.sub}</p>}
      <div style={s.gridMaterias}>
        {curso.materias.map((m) => (
          <button key={m.nombre} style={s.carpetaMateria} onClick={() => onMateria(m.nombre)}>
            <div style={s.solapaClara} />
            <div style={s.carpetaMateriaCuerpo}>
              <FileText size={20} strokeWidth={1.8} color={c.azulOscuro} />
              <span style={{ flex: 1 }}>{m.nombre}</span>
              {m.especifica && <span style={s.tagEsp}>específica</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- MATERIA — Firestore + Cloudinary ----------

function VistaMateria({ curso, materia, onVolver, isAdmin, toast }) {
  const carpetaId = `${slug(curso.id)}__${slug(materia)}`;
  const [archivos, setArchivos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setCargando(true);
    const q = query(
      collection(db, "archivos"),
      where("carpetaId", "==", carpetaId),
      orderBy("fecha", "desc")
    );
    const unsub = onSnapshot(q,
      (snap) => { setArchivos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setCargando(false); },
      () => { setCargando(false); toast("No se pudieron cargar los archivos. Revisá tu conexión.", "error"); }
    );
    return unsub;
  }, [carpetaId]);

  const subirArchivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!extOk(file.name)) {
      toast("Formato no permitido. Solo PDF, Word (.doc/.docx) o JPG/PNG.", "error");
      return;
    }
    if (file.size > MAX_MB * 1048576) {
      toast(`El archivo supera el límite de ${MAX_MB} MB.`, "error");
      return;
    }

    setSubiendo(true);
    try {
      // 1. Subir el archivo a Cloudinary → obtenemos la URL pública
      const { url, publicId } = await subirArchivoCloudinary(file, carpetaId);

      // 2. Guardar los metadatos en Firestore (sin el archivo en sí)
      await addDoc(collection(db, "archivos"), {
        carpetaId,
        nombre: file.name,
        tipo: icono(file.name),
        tamano: file.size,
        url,           // URL pública de Cloudinary
        publicId,      // ID de Cloudinary (para referencia futura)
        fecha: serverTimestamp(),
      });

      toast("Archivo subido correctamente.");
    } catch (err) {
      console.error(err);
      toast("No se pudo subir el archivo. Revisá tu conexión e intentá de nuevo.", "error");
    } finally {
      setSubiendo(false);
    }
  };

  const eliminar = async (archivo) => {
    try {
      // Eliminamos el registro de Firestore (el archivo queda en Cloudinary
      // pero deja de aparecer en el sitio — ver nota en cloudinary.js)
      await deleteDoc(doc(db, "archivos", archivo.id));
      toast("Archivo eliminado del sitio.", "info");
    } catch {
      toast("No se pudo eliminar el archivo.", "error");
    }
  };

  return (
    <div>
      <Volver onClick={onVolver} label={`Volver a ${curso.nombre}`} />
      <h2 style={s.h2}>{materia}</h2>
      <p style={s.sub}>{curso.nombre}{curso.sub ? ` · ${curso.sub}` : ""}</p>

      <div style={s.subidaBox}>
        <div style={s.subidaTexto}>
          <strong>Formatos aceptados:</strong> PDF, Word (.doc / .docx), JPG o PNG. Máximo {MAX_MB} MB por archivo.
        </div>
        <button style={s.subirBtn} onClick={() => setShowPopup(true)} disabled={subiendo}>
          <Upload size={18} />{subiendo ? "Subiendo..." : "Subir archivo"}
        </button>
        <input ref={inputRef} type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          style={{ display: "none" }} onChange={subirArchivo} />
        {showPopup && (
          <PopupAviso onConfirmar={() => { setShowPopup(false); inputRef.current?.click(); }} onCancelar={() => setShowPopup(false)} />
        )}
      </div>

      {cargando ? (
        <p style={{ color: c.suave, padding: "20px 0" }}>Cargando archivos...</p>
      ) : archivos.length === 0 ? (
        <div style={s.vacio}>
          <FileText size={28} strokeWidth={1.5} color={c.azulMedio} />
          <p style={{ color: c.suave, fontSize: 14, maxWidth: 340, margin: "10px auto 0" }}>
            Todavía no hay archivos en esta materia. ¡Sé el primero en subir algo!
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {archivos.map((a) => (
            <ArchivoItem key={a.id} archivo={a} isAdmin={isAdmin} onEliminar={() => eliminar(a)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ArchivoItem({ archivo, isAdmin, onEliminar }) {
  const [confirm, setConfirm] = useState(false);
  const fecha = archivo.fecha?.toDate?.()?.toLocaleDateString("es-AR") ?? "";
  return (
    <li style={s.archivoItem}>
      <a href={archivo.url} target="_blank" rel="noopener noreferrer" style={s.archivoLink}>
        <span style={{ ...s.tipoTag, ...tipoColor(archivo.tipo) }}>{archivo.tipo}</span>
        <span style={s.archivoNombre}>{archivo.nombre}</span>
        <span style={{ fontSize: 12, color: c.suave, flexShrink: 0 }}>
          {fmtBytes(archivo.tamano)}{fecha ? ` · ${fecha}` : ""}
        </span>
      </a>
      {isAdmin && (confirm
        ? <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button style={s.btnBorrarSi} onClick={onEliminar}>Borrar</button>
            <button style={s.btnBorrarNo} onClick={() => setConfirm(false)}>Cancelar</button>
          </span>
        : <button style={s.btnTrash} onClick={() => setConfirm(true)} title="Eliminar archivo">
            <Trash2 size={16} />
          </button>
      )}
    </li>
  );
}

function tipoColor(t) {
  if (t === "PDF") return { background: "#FCE8E8", color: "#A33A3A" };
  if (t === "DOC") return { background: "#E3EBF7", color: "#2E5F94" };
  return { background: "#E9F2E9", color: "#3F7A4D" };
}

// ---------- DUDAS ----------

const FAQS = [
  { q: "¿Quién puede subir archivos?", a: "Cualquier estudiante que tenga el link. No hace falta registrarse ni crear una cuenta." },
  { q: "¿En qué formato tengo que subir los archivos?", a: "Solo se aceptan PDF, Word (.doc o .docx) o imágenes JPG/PNG. Si tenés el apunte en otro formato, lo más simple es sacarle una foto o exportarlo a PDF antes de subirlo." },
  { q: "¿Puedo borrar un archivo que subí por error?", a: "La eliminación está reservada al administrador del sitio para mantener todo ordenado. Si subiste algo por error, escribí al contacto de esta sección para que lo revisen." },
  { q: "¿Hay límite de tamaño por archivo?", a: "Sí, 8 MB por archivo. Si es más pesado, probá comprimir el PDF o reducir la calidad de la imagen antes de subirlo." },
  { q: "Curso 4°, 5° o 6°: ¿por qué no aparece mi orientación en el turno que curso?", a: "Economía y Administración solo está en Turno Mañana, y Arte solo en Turno Tarde. Ciencias Sociales y Naturales están disponibles en ambos turnos." },
];

function VistaDudas() {
  const [abierto, setAbierto] = useState(null);
  return (
    <div>
      <h2 style={s.h2}>Dudas</h2>
      <p style={s.sub}>Antes de escribir, fijate si tu pregunta ya está respondida acá abajo.</p>
      <div style={{ ...s.card, display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 28 }}>
        <Phone size={20} strokeWidth={2} color={c.azulOscuro} />
        <div>
          <div style={{ fontWeight: 700, color: c.azulOscuro, marginBottom: 4 }}>¿No encontrás la respuesta?</div>
          <div style={{ fontSize: 14, color: c.suave }}>
            Escribinos por WhatsApp al <strong>[completar número de contacto]</strong>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {FAQS.map((f, i) => (
          <div key={i} style={{ border: `1px solid ${c.borde}`, borderRadius: 10, background: "#fff", overflow: "hidden" }}>
            <button style={s.faqBtn} onClick={() => setAbierto(abierto === i ? null : i)}>
              <MessageCircle size={16} strokeWidth={2} color={c.azulOscuro} />
              <span style={{ flex: 1 }}>{f.q}</span>
              <span style={{ fontSize: 18, color: c.azulOscuro }}>{abierto === i ? "–" : "+"}</span>
            </button>
            {abierto === i && (
              <div style={{ padding: "0 16px 16px 42px", fontSize: 13.5, color: c.suave, lineHeight: 1.6 }}>{f.a}</div>
            )}
          </div>
        ))}
      </div>
      <p style={{ marginTop: 24, fontSize: 12.5, color: c.suave, fontStyle: "italic" }}>
        El número de contacto y las preguntas frecuentes se editan en el código (src/App.jsx), buscando FAQS y el texto del número.
      </p>
    </div>
  );
}

// ---------- AUXILIARES ----------

function Volver({ onClick, label }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "none", color: c.azulOscuro, fontSize: 14, fontWeight: 600, padding: "6px 0", marginBottom: 18, cursor: "pointer" }}>
      <ChevronLeft size={18} strokeWidth={2.4} />{label}
    </button>
  );
}

function Toast({ msg, tipo }) {
  const bg = tipo === "error" ? "#A33A3A" : tipo === "info" ? c.azulOscuro : "#3F7A4D";
  const Icon = tipo === "error" || tipo === "info" ? AlertCircle : CheckCircle2;
  return (
    <div style={{ ...s.toast, background: bg }}>
      <Icon size={16} />{msg}
    </div>
  );
}

function AdminModal({ onClose, onOk }) {
  const [clave, setClave] = useState("");
  const [err, setErr] = useState(false);
  const intentar = () => {
    if (clave === ADMIN_KEY) { lsSet(ADMIN_FLAG, "true"); onOk(); }
    else setErr(true);
  };
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: "absolute", top: 12, right: 12, border: "none", background: "none", cursor: "pointer", color: c.suave }}><X size={18} /></button>
        <Lock size={22} strokeWidth={1.8} color={c.azulOscuro} />
        <h3 style={{ color: c.azulOscuro, margin: "10px 0 6px" }}>Acceso de administrador</h3>
        <p style={{ fontSize: 13, color: c.suave, marginBottom: 16, lineHeight: 1.5 }}>Esta clave habilita la opción de eliminar archivos del sitio.</p>
        <input type="password" value={clave}
          onChange={(e) => { setClave(e.target.value); setErr(false); }}
          onKeyDown={(e) => e.key === "Enter" && intentar()}
          placeholder="Clave de administrador" autoFocus
          style={{ width: "100%", padding: "11px 14px", borderRadius: 8, border: `1px solid ${err ? "#A33A3A" : c.borde}`, fontSize: 14, marginBottom: 8, boxSizing: "border-box", fontFamily: "inherit" }} />
        {err && <p style={{ color: "#A33A3A", fontSize: 12.5, margin: "0 0 10px" }}>Clave incorrecta.</p>}
        <button onClick={intentar} style={{ width: "100%", background: c.azulOscuro, color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>Ingresar</button>
      </div>
    </div>
  );
}

// ---------- POPUP AVISO ----------

function PopupAviso({ onConfirmar, onCancelar }) {
  return (
    <div style={s.overlay} onClick={onCancelar}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <button onClick={onCancelar} style={{ position: "absolute", top: 12, right: 12, border: "none", background: "none", cursor: "pointer", color: c.suave }}><X size={18} /></button>
        <Upload size={26} strokeWidth={1.8} color={c.azulOscuro} />
        <h3 style={{ color: c.azulOscuro, margin: "10px 0 8px", fontSize: 18 }}>Antes de subir tu archivo</h3>
        <p style={{ fontSize: 14, color: c.suave, lineHeight: 1.6, margin: "0 0 10px" }}>
          Asegurate de que el <strong>nombre del archivo</strong> describa claramente su contenido.
        </p>
        <p style={{ fontSize: 13.5, color: c.suave, lineHeight: 1.6, margin: "0 0 20px", background: c.beigeCard, borderRadius: 8, padding: "10px 12px", border: `1px solid ${c.borde}` }}>
          Ejemplos de buenos nombres:<br />
          <strong>resumen-revolucion-francesa.pdf</strong><br />
          <strong>guia-funciones-matematica.docx</strong><br />
          <strong>examen-2023-biologia.pdf</strong>
        </p>
        <p style={{ fontSize: 13, color: c.suave, margin: "0 0 20px" }}>
          Un buen nombre hace que todos encuentren el archivo fácilmente.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancelar} style={{ flex: 1, border: `1px solid ${c.borde}`, background: "#fff", color: c.suave, borderRadius: 8, padding: "10px 0", fontSize: 14, cursor: "pointer" }}>
            Cancelar
          </button>
          <button onClick={onConfirmar} style={{ flex: 2, background: c.azulOscuro, color: "#fff", border: "none", borderRadius: 8, padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Entendido, elegir archivo
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- ESTILOS ----------

const c = {
  beige: "#F4EEE1", beigeCard: "#FBF8F1", azulClaro: "#9DC4DD",
  azulMedio: "#6FA3C4", azulOscuro: "#2E5F86", azulSolapa: "#4A87AC",
  rojo: "#C23B3B", texto: "#33302A", suave: "#6B655A", borde: "#DCD3BE",
};

const css = `* { box-sizing: border-box; } body { margin: 0; } button { cursor: pointer; font-family: inherit; }`;

const s = {
  page: { minHeight: "100vh", background: c.beige, fontFamily: "'Segoe UI', system-ui, sans-serif", color: c.texto, display: "flex", flexDirection: "column" },
  header: { position: "sticky", top: 0, zIndex: 20, background: c.beigeCard, borderBottom: `1px solid ${c.borde}` },
  headerInner: { maxWidth: 1100, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  brand: { fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 20, letterSpacing: 1, color: c.azulOscuro },
  brandSub: { fontSize: 12, color: c.suave },
  nav: { display: "flex", gap: 6, alignItems: "center" },
  navBtn: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: "none", background: "transparent", color: c.texto, fontSize: 14, fontWeight: 600 },
  navActive: { background: c.azulClaro, color: c.azulOscuro },
  adminBtn: { padding: "8px 10px", color: c.suave },
  adminOn: { background: c.rojo, color: "#fff" },
  main: { flex: 1, maxWidth: 1100, width: "100%", margin: "0 auto", padding: "36px 20px 60px" },
  footer: { textAlign: "center", padding: "18px 20px", fontSize: 12, color: c.suave, borderTop: `1px solid ${c.borde}` },
  titulo: { fontFamily: "Georgia, serif", color: c.rojo, fontWeight: 800, fontSize: "clamp(28px,5vw,44px)", textDecoration: "underline", textDecorationThickness: "3px", textUnderlineOffset: "8px", margin: "0 0 18px" },
  lead: { maxWidth: 680, margin: "0 auto 36px", fontSize: 16, lineHeight: 1.6, color: c.suave },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 18, marginBottom: 36, textAlign: "left" },
  card: { background: c.beigeCard, border: `1px solid ${c.borde}`, borderRadius: 14, padding: "22px 20px" },
  cardTitulo: { fontSize: 16, margin: "12px 0 8px", color: c.azulOscuro },
  cardTexto: { fontSize: 14, lineHeight: 1.55, color: c.suave, margin: 0 },
  cta: { display: "inline-flex", alignItems: "center", gap: 10, background: c.azulOscuro, color: "#fff", border: "none", borderRadius: 999, padding: "14px 28px", fontSize: 16, fontWeight: 700, boxShadow: "0 4px 14px rgba(46,95,134,.25)" },
  nota: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, maxWidth: 560, margin: "28px auto 0", fontSize: 13, color: c.suave, textAlign: "left" },
  h2: { fontFamily: "Georgia, serif", fontSize: 28, color: c.azulOscuro, margin: "0 0 4px" },
  sub: { fontSize: 15, color: c.suave, margin: "0 0 28px" },
  anioTitulo: { fontSize: 18, color: c.texto, display: "flex", alignItems: "baseline", gap: 10, borderBottom: `2px solid ${c.borde}`, paddingBottom: 8, marginBottom: 16 },
  tag: { fontSize: 12, fontWeight: 500, color: c.suave, background: "#fff", border: `1px solid ${c.borde}`, borderRadius: 999, padding: "2px 10px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px,1fr))", gap: 16 },
  carpeta: { position: "relative", border: "none", background: "none", padding: 0, textAlign: "left", paddingTop: 14 },
  solapa: { position: "absolute", top: 0, left: 14, width: "45%", height: 16, background: c.azulSolapa, borderRadius: "6px 6px 0 0" },
  carpetaCuerpo: { background: c.azulMedio, borderRadius: 10, padding: "16px 14px", color: "#fff", boxShadow: "0 3px 8px rgba(46,95,134,.18)" },
  carpetaNombre: { fontSize: 17, fontWeight: 700 },
  carpetaSub: { fontSize: 12, opacity: 0.9, marginTop: 2 },
  carpetaMeta: { fontSize: 11.5, opacity: 0.85, marginTop: 8 },
  gridMaterias: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 14 },
  carpetaMateria: { position: "relative", border: "none", background: "none", padding: 0, textAlign: "left", paddingTop: 10 },
  solapaClara: { position: "absolute", top: 0, left: 12, width: "40%", height: 12, background: c.azulClaro, borderRadius: "5px 5px 0 0" },
  carpetaMateriaCuerpo: { background: "#E4F0F7", border: `1px solid ${c.azulClaro}`, borderRadius: 9, padding: "14px", display: "flex", alignItems: "center", gap: 10, color: c.azulOscuro, fontWeight: 600, fontSize: 14.5 },
  tagEsp: { fontSize: 10, background: c.azulOscuro, color: "#fff", borderRadius: 999, padding: "2px 7px", fontWeight: 600 },
  subidaBox: { background: c.beigeCard, border: `1px dashed ${c.azulMedio}`, borderRadius: 12, padding: 18, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 26 },
  subidaTexto: { fontSize: 13, color: c.suave, maxWidth: 460, lineHeight: 1.5 },
  subirBtn: { display: "flex", alignItems: "center", gap: 8, background: c.azulOscuro, color: "#fff", border: "none", borderRadius: 999, padding: "11px 22px", fontSize: 14.5, fontWeight: 700, whiteSpace: "nowrap" },
  vacio: { textAlign: "center", padding: "44px 20px", border: `1px solid ${c.borde}`, borderRadius: 12, background: "#fff" },
  archivoItem: { display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${c.borde}`, borderRadius: 10, padding: "10px 12px" },
  archivoLink: { display: "flex", alignItems: "center", gap: 12, flex: 1, color: c.texto, minWidth: 0, textDecoration: "none" },
  tipoTag: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "4px 8px", flexShrink: 0 },
  archivoNombre: { flex: 1, fontSize: 14.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  btnTrash: { border: "none", background: "none", color: "#A33A3A", padding: 6, borderRadius: 6, flexShrink: 0 },
  btnBorrarSi: { border: "none", background: "#A33A3A", color: "#fff", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700 },
  btnBorrarNo: { border: `1px solid ${c.borde}`, background: "#fff", color: c.suave, borderRadius: 6, padding: "5px 10px", fontSize: 12 },
  faqBtn: { width: "100%", display: "flex", alignItems: "center", gap: 10, border: "none", background: "none", padding: "14px 16px", fontSize: 14.5, fontWeight: 600, textAlign: "left", color: c.texto },
  toast: { position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", color: "#fff", padding: "12px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 6px 20px rgba(0,0,0,.18)", zIndex: 50 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 },
  modal: { position: "relative", background: "#fff", borderRadius: 16, padding: 28, maxWidth: 360, width: "100%", textAlign: "center" },
};
