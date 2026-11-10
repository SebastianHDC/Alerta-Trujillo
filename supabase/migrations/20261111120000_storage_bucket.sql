-- Alerta Trujillo - bucket privado para evidencias y adjuntos.
-- Solo el backend accede con la clave de servicio; no se crean politicas publicas.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
	'alerta-trujillo', 'alerta-trujillo', FALSE, 41943040,
	ARRAY[
		'image/jpeg', 'image/png', 'video/mp4', 'video/webm', 'application/pdf',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	]
)
ON CONFLICT (id) DO UPDATE SET public = FALSE;
