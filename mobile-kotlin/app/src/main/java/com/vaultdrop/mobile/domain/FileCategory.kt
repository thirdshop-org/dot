package com.vaultdrop.mobile.domain

enum class FileCategory {
    PDF,
    OFFICE,
    IMAGE,
    TEXT,
    VIDEO,
    AUDIO,
    OTHER;

    val dbValue: String get() = name
}

fun computeCategory(mimeType: String?, extension: String?): FileCategory {
    val mime = mimeType?.lowercase().orEmpty()
    val ext = extension?.lowercase().orEmpty()

    return when {
        mime == "application/pdf" -> FileCategory.PDF
        mime.startsWith("image/") -> FileCategory.IMAGE
        mime.startsWith("video/") -> FileCategory.VIDEO
        mime.startsWith("audio/") -> FileCategory.AUDIO
        mime.startsWith("text/") || ext in TEXT_EXTENSIONS -> FileCategory.TEXT
        mime in OFFICE_MIMES || ext in OFFICE_EXTENSIONS -> FileCategory.OFFICE
        else -> FileCategory.OTHER
    }
}

private val OFFICE_MIMES = setOf(
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.oasis.opendocument.text",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.oasis.opendocument.presentation",
)

private val OFFICE_EXTENSIONS = setOf(
    "doc", "docx", "odt", "rtf",
    "xls", "xlsx", "ods", "csv",
    "ppt", "pptx", "odp",
)

private val TEXT_EXTENSIONS = setOf(
    "txt", "md", "html", "xml", "json", "css", "js", "kt", "py", "java",
    "log", "ini", "cfg", "yaml", "yml", "toml",
)
