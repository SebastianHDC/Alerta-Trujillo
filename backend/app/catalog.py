CATEGORIES = {
    "robo": "Robo",
    "hurto": "Hurto o asalto",
    "sospechoso": "Actividad sospechosa",
    "vandalismo": "Vandalismo",
    "iluminacion": "Iluminación deficiente",
    "via": "Obstáculo en la vía",
    "otro": "Otra incidencia",
}

DISTRICTS = {
    "Trujillo": (-8.1117, -79.0287),
    "Víctor Larco Herrera": (-8.1432, -79.0475),
    "La Esperanza": (-8.0785, -79.0501),
    "El Porvenir": (-8.0746, -79.0007),
    "Florencia de Mora": (-8.0857, -79.0217),
    "Huanchaco": (-8.0808, -79.1214),
    "Moche": (-8.1715, -79.0095),
    "Salaverry": (-8.2223, -78.9767),
    "Laredo": (-8.0890, -78.9601),
    "Poroto": (-8.0112, -78.7671),
    "Simbal": (-7.9771, -78.8136),
    "Alto Trujillo": (-8.0448, -78.9917),
}

# Taxonomía del conocimiento (informe, cap. VIII, tabla 10).
KNOWLEDGE_CATEGORIES = {
    "contexto": "Contexto urbano",
    "incidencias": "Gestión de incidencias",
    "aprendizaje": "Aprendizaje",
    "operacion": "Operación tecnológica",
    "analisis": "Análisis de información",
}

KNOWLEDGE_KINDS = {
    "documento": "Documento",
    "procedimiento": "Procedimiento",
    "guia": "Guía",
    "manual": "Manual",
    "video": "Video",
    "faq": "Pregunta frecuente",
    "leccion": "Lección aprendida",
}

# Funciones del equipo y conocimiento crítico de cada una (informe, cap. VIII, tablas 6 y 9).
STAFF_FUNCTIONS = {
    "coordinacion": {"label": "Coordinación", "process": "Organización y derivación", "category": "incidencias",
                     "knowledge": "Alcance del piloto, responsabilidades y competencias de los contactos confirmados."},
    "conocimiento": {"label": "Gestión del conocimiento", "process": "Documentación y formación", "category": "aprendizaje",
                     "knowledge": "Clasificación de contenidos, elaboración de guías y recuperación de lecciones aprendidas."},
    "participacion": {"label": "Participación", "process": "Recopilación de aportes", "category": "contexto",
                      "knowledge": "Vocabulario local, necesidades de los vecinos y formas comprensibles de recoger información."},
    "validacion": {"label": "Validación (moderación)", "process": "Revisión de incidencias", "category": "incidencias",
                   "knowledge": "Criterios para aclarar descripciones, reconocer duplicados y proteger información sensible."},
    "desarrollo": {"label": "Desarrollo", "process": "Soporte tecnológico", "category": "operacion",
                   "knowledge": "Funcionamiento de la aplicación, gestión de accesos y recuperación de la información."},
    "analisis": {"label": "Análisis de información", "process": "Análisis y consulta", "category": "analisis",
                 "knowledge": "Definición de indicadores e interpretación de los datos según su periodo y estado de revisión."},
}

# Lista de control aplicada antes de mostrar un reporte (informe, estrategia FA1).
REVIEW_CHECKLIST = {
    "sin_nombres": "El resumen no contiene nombres, apodos ni rasgos de personas identificables.",
    "sin_domicilios": "No incluye domicilios exactos, placas ni números de contacto.",
    "sin_acusaciones": "No acusa a personas o negocios identificables.",
    "no_emergencia": "No es una emergencia en curso que deba derivarse a los canales oficiales.",
}

POINTS_VERIFIED_REPORT = 10
POINTS_VOTE = 2
POINTS_VOTE_MATCH = 5
