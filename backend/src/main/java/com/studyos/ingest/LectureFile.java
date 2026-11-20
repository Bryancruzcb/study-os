package com.studyos.ingest;

import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.GraphicsEnvironment;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.Closeable;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.poi.sl.draw.Drawable;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.select.NodeFilter;
import org.jsoup.select.NodeTraversor;

/**
 * Turns an upload into the PDF the rest of the ingest reads. Every later step works on a PDF:
 * the page count, the check that a cited slide exists, and the bytes kept for generating more
 * questions. So a lecture that arrives as slides, a Word file, a web page, a photo or plain
 * text becomes one here, at the edge, and nothing after it has to know what it was.
 *
 * <p>One PDF page is one slide, one picture, or one printed page of text, so "slide N" in a
 * citation still points at something the student can find.
 *
 * <p>The bytes decide the kind and the extension only breaks a tie: a .pptx renamed to .pdf is
 * still read as slides. Anything it cannot read comes back as a {@link Rejected} with a
 * sentence that says what to do instead, and costs no provider call.
 */
final class LectureFile {

    sealed interface Conversion permits Converted, Rejected {}

    /** The upload as a PDF, ready for the page count and extraction. */
    record Converted(byte[] pdf) implements Conversion {}

    /** Why the upload cannot be read, written for the student. */
    record Rejected(String message) implements Conversion {}

    /** What the bytes are. A kind with a refusal is recognized but not read. */
    enum Kind {
        PDF("PDF", null),
        PICTURE("image", null),
        SLIDES("PowerPoint file", null),
        WORD("Word file", null),
        WEB_PAGE("web page", null),
        TEXT("text file", null),
        OLD_OFFICE(null, "This is an older Office file (.ppt, .doc or .xls). Open it, Save As .pptx, "
            + ".docx or PDF, and upload that."),
        SPREADSHEET(null, "This is a spreadsheet. Study OS reads lectures, so export the sheet to PDF "
            + "and upload that if it holds lecture material."),
        OTHER_DOCUMENT(null, "Study OS cannot open this document format (OpenDocument, RTF, Keynote "
            + "or Pages). Export it to PDF, PowerPoint or Word and upload that."),
        WEB_ARCHIVE(null, "This is a saved web archive (.mhtml). Save the page as \"Webpage, HTML "
            + "only\" or print it to PDF, and upload that."),
        HEIC(null, "This photo is HEIC or AVIF, which Study OS cannot read. Export it as JPEG or PNG "
            + "(on an iPhone: Settings > Camera > Formats > Most Compatible) and upload that."),
        UNKNOWN(null, "Study OS cannot read this kind of file. It takes PDF, PowerPoint (.pptx), Word "
            + "(.docx), images (JPEG, PNG, GIF, BMP, TIFF, WebP), web pages (.html) and plain text "
            + "or Markdown.");

        final String noun;
        final String refusal;

        Kind(String noun, String refusal) {
            this.noun = noun;
            this.refusal = refusal;
        }
    }

    private static final byte[] PDF_MAGIC = {'%', 'P', 'D', 'F', '-'};
    private static final byte[] ZIP_MAGIC = {'P', 'K', 0x03, 0x04};
    private static final byte[] OLE2_MAGIC =
        {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1};
    private static final byte[] JPEG_MAGIC = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG_MAGIC = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A};
    private static final byte[] GIF87_MAGIC = {'G', 'I', 'F', '8', '7', 'a'};
    private static final byte[] GIF89_MAGIC = {'G', 'I', 'F', '8', '9', 'a'};
    private static final byte[] TIFF_LE_MAGIC = {'I', 'I', 0x2A, 0x00};
    private static final byte[] TIFF_BE_MAGIC = {'M', 'M', 0x00, 0x2A};
    private static final byte[] UTF8_BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
    private static final byte[] UTF16LE_BOM = {(byte) 0xFF, (byte) 0xFE};
    private static final byte[] UTF16BE_BOM = {(byte) 0xFE, (byte) 0xFF};
    private static final Set<String> HEIF_BRANDS =
        Set.of("heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis");
    // the sizes a BMP's second header can have; "BM" alone would also match text like "BMW notes"
    private static final Set<Integer> BMP_HEADER_SIZES = Set.of(12, 40, 52, 56, 64, 108, 124);

    // a picture page's long edge, in points: an A4 page's height
    private static final float PAGE_LONG_EDGE = 842f;
    // a phone photo is decoded at most this many pixels on its long edge. The model sees less
    // than this anyway, and a full 48-megapixel decode would not fit the free host's heap
    private static final int MAX_PICTURE_EDGE = 2400;
    // a TIFF scan can hold many pages; past this many the rest are left off
    private static final int MAX_PICTURE_PAGES = 200;
    // a slide is drawn this many pixels wide: the model reads 12-point text at this size, and
    // a wider or finer drawing mostly grows the copy kept in the database
    private static final int SLIDE_WIDTH_PX = 1280;
    private static final float SLIDE_JPEG_QUALITY = 0.8f;
    private static final float JPEG_QUALITY = 0.85f;

    // text pages: US Letter, 11-point Liberation Sans, which ships inside PDFBox
    private static final String TEXT_FONT = "/org/apache/pdfbox/resources/ttf/LiberationSans-Regular.ttf";
    private static final float FONT_SIZE = 11f;
    private static final float LEADING = 15f;
    private static final float MARGIN = 60f;
    private static final float TEXT_WIDTH = PDRectangle.LETTER.getWidth() - 2 * MARGIN;

    static {
        // the WebP reader is a plugin in its own jar. Inside the packaged app the first scan can
        // miss nested jars, so scan again here; and decode in memory, without temp files
        ImageIO.scanForPlugins();
        ImageIO.setUseCache(false);
    }

    private LectureFile() {}

    /** The upload as a PDF, or the reason it cannot be read. */
    static Conversion toPdf(byte[] bytes, String filename) {
        if (bytes == null || bytes.length == 0) {
            return new Rejected("This file is empty. Check that it finished saving, and upload it again.");
        }
        Kind kind = detect(bytes, filename);
        if (kind.refusal != null) return new Rejected(kind.refusal);
        try {
            return switch (kind) {
                case PDF -> new Converted(bytes);
                case PICTURE -> new Converted(picturePdf(bytes));
                case SLIDES -> slidesPdf(bytes);
                case WORD -> textPdf(wordText(bytes), kind);
                case WEB_PAGE -> textPdf(webPageText(bytes), kind);
                case TEXT -> textPdf(tidy(decodeText(bytes).orElse("")), kind);
                // every other kind carries a refusal and returned above
                default -> new Rejected(Kind.UNKNOWN.refusal);
            };
        } catch (IOException | RuntimeException e) {
            // POI, ImageIO and jsoup report a damaged or unexpected file with a range of
            // exceptions; for the student they all mean the same thing
            return new Rejected("Study OS could not open this " + kind.noun + ". Open it, save or "
                + "export it again (a PDF always works), and upload that.");
        }
    }

    /** Which kind of file the bytes are; the lowercased filename only breaks ties. */
    static Kind detect(byte[] bytes, String filename) {
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (startsWith(bytes, PDF_MAGIC)) return Kind.PDF;
        if (isPicture(bytes)) return Kind.PICTURE;
        if (isHeif(bytes)) return Kind.HEIC;
        if (startsWith(bytes, OLE2_MAGIC)) return Kind.OLD_OFFICE;
        if (startsWith(bytes, ZIP_MAGIC)) return zipKind(bytes, name);
        if (name.endsWith(".mhtml") || name.endsWith(".mht")) return Kind.WEB_ARCHIVE;
        Optional<String> text = decodeText(bytes);
        if (text.isEmpty()) return Kind.UNKNOWN;
        String head = text.get().replace("﻿", "").stripLeading().toLowerCase(Locale.ROOT);
        // both are text, but read as text they would be markup, not the lecture
        if (head.startsWith("{\\rtf")) return Kind.OTHER_DOCUMENT;
        if (name.endsWith(".svg") || head.startsWith("<svg")) return Kind.UNKNOWN;
        return isWebPage(name, head) ? Kind.WEB_PAGE : Kind.TEXT;
    }

    // --- detection ---------------------------------------------------------------------------

    private static boolean isPicture(byte[] b) {
        return startsWith(b, JPEG_MAGIC) || startsWith(b, PNG_MAGIC) || startsWith(b, GIF87_MAGIC)
            || startsWith(b, GIF89_MAGIC) || startsWith(b, TIFF_LE_MAGIC) || startsWith(b, TIFF_BE_MAGIC)
            || isWebp(b) || isBmp(b);
    }

    private static boolean isWebp(byte[] b) {
        return b.length >= 12 && ascii(b, 0, 4).equals("RIFF") && ascii(b, 8, 4).equals("WEBP");
    }

    private static boolean isBmp(byte[] b) {
        if (b.length < 18 || b[0] != 'B' || b[1] != 'M') return false;
        for (int i = 6; i < 10; i++) {
            if (b[i] != 0) return false;
        }
        return BMP_HEADER_SIZES.contains(u32(b, 14, true));
    }

    // HEIC and AVIF share the ISO box layout: "ftyp" at byte 4, then the brand
    private static boolean isHeif(byte[] b) {
        return b.length >= 12 && ascii(b, 4, 4).equals("ftyp") && HEIF_BRANDS.contains(ascii(b, 8, 4));
    }

    // Office and OpenDocument files are all ZIPs; the entry names say which one this is
    private static Kind zipKind(byte[] bytes, String name) {
        Set<String> entries = new HashSet<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for (ZipEntry entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                entries.add(entry.getName());
            }
        } catch (IOException | IllegalArgumentException e) {
            // a damaged archive keeps the names read so far; the extension covers the rest
        }
        if (entries.contains("ppt/presentation.xml")) return Kind.SLIDES;
        if (entries.contains("word/document.xml")) return Kind.WORD;
        if (entries.contains("xl/workbook.xml")) return Kind.SPREADSHEET;
        if (entries.contains("mimetype") || entries.stream().anyMatch(n -> n.startsWith("Index/"))) {
            return Kind.OTHER_DOCUMENT;
        }
        if (name.endsWith(".pptx")) return Kind.SLIDES;
        if (name.endsWith(".docx")) return Kind.WORD;
        if (name.endsWith(".xlsx")) return Kind.SPREADSHEET;
        return Kind.UNKNOWN;
    }

    // head: the text with any byte-order mark and leading space removed, lowercased
    private static boolean isWebPage(String name, String head) {
        if (name.endsWith(".html") || name.endsWith(".htm") || name.endsWith(".xhtml")) return true;
        return head.startsWith("<!doctype html") || head.startsWith("<html");
    }

    /** The bytes as text, or empty when they look like a binary file. */
    static Optional<String> decodeText(byte[] b) {
        if (startsWith(b, UTF8_BOM)) return strictUtf8(b, UTF8_BOM.length);
        if (startsWith(b, UTF16LE_BOM)) {
            return Optional.of(new String(b, 2, b.length - 2, StandardCharsets.UTF_16LE));
        }
        if (startsWith(b, UTF16BE_BOM)) {
            return Optional.of(new String(b, 2, b.length - 2, StandardCharsets.UTF_16BE));
        }
        if (!looksTextual(b)) return Optional.empty();
        // not UTF-8: an older Windows editor saved it, and Windows-1252 reads every byte
        return strictUtf8(b, 0).or(() -> Optional.of(new String(b, Charset.forName("windows-1252"))));
    }

    // no NUL in the first 8 KB, and at most 1% other control bytes
    private static boolean looksTextual(byte[] b) {
        int n = Math.min(b.length, 8192);
        int control = 0;
        for (int i = 0; i < n; i++) {
            int c = b[i] & 0xFF;
            if (c == 0) return false;
            if (c < 0x20 && c != '\t' && c != '\n' && c != '\r' && c != '\f') control++;
        }
        return control * 100 <= n;
    }

    private static Optional<String> strictUtf8(byte[] b, int offset) {
        try {
            return Optional.of(StandardCharsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(b, offset, b.length - offset))
                .toString());
        } catch (CharacterCodingException e) {
            return Optional.empty();
        }
    }

    // --- pictures: one page each ---------------------------------------------------------------

    private static byte[] picturePdf(byte[] bytes) throws IOException {
        int turn = exifRotation(bytes);
        try (PDDocument doc = new PDDocument()) {
            List<BufferedImage> pictures;
            try {
                pictures = readPictures(bytes);
            } catch (IOException unreadable) {
                // ImageIO cannot decode a CMYK JPEG, but a PDF can carry that JPEG as it is
                if (!startsWith(bytes, JPEG_MAGIC)) throw unreadable;
                addPicturePage(doc, JPEGFactory.createFromByteArray(doc, bytes), turn);
                return save(doc);
            }
            for (BufferedImage picture : pictures) {
                addPicturePage(doc, JPEGFactory.createFromImage(doc, upright(picture, turn), JPEG_QUALITY), 0);
            }
            return save(doc);
        }
    }

    private static List<BufferedImage> readPictures(byte[] bytes) throws IOException {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) throw new IOException("no reader for this picture");
            ImageReader reader = readers.next();
            try {
                reader.setInput(in);
                // every page of a TIFF scan; only the first frame of an animated GIF
                boolean tiff = reader.getFormatName().toLowerCase(Locale.ROOT).startsWith("tif");
                int pages = tiff ? Math.min(reader.getNumImages(true), MAX_PICTURE_PAGES) : 1;
                List<BufferedImage> out = new ArrayList<>();
                for (int i = 0; i < pages; i++) {
                    int longEdge = Math.max(reader.getWidth(i), reader.getHeight(i));
                    int step = Math.max(1, (int) Math.ceil(longEdge / (double) MAX_PICTURE_EDGE));
                    ImageReadParam param = reader.getDefaultReadParam();
                    param.setSourceSubsampling(step, step, 0, 0);
                    out.add(reader.read(i, param));
                }
                if (out.isEmpty()) throw new IOException("the picture has no frames");
                return out;
            } finally {
                reader.dispose();
            }
        }
    }

    // RGB on white, turned the way the camera meant: a transparent PNG would otherwise go black
    // in a JPEG, and a portrait phone photo would lie on its side
    private static BufferedImage upright(BufferedImage src, int degrees) {
        boolean quarter = degrees == 90 || degrees == 270;
        int w = quarter ? src.getHeight() : src.getWidth();
        int h = quarter ? src.getWidth() : src.getHeight();
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, w, h);
            AffineTransform turn = new AffineTransform();
            turn.translate(w / 2.0, h / 2.0);
            turn.rotate(Math.toRadians(degrees));
            turn.translate(-src.getWidth() / 2.0, -src.getHeight() / 2.0);
            g.drawImage(src, turn, null);
        } finally {
            g.dispose();
        }
        return out;
    }

    private static void addPicturePage(PDDocument doc, PDImageXObject image, int rotation) throws IOException {
        float scale = PAGE_LONG_EDGE / Math.max(image.getWidth(), image.getHeight());
        float w = image.getWidth() * scale;
        float h = image.getHeight() * scale;
        PDPage page = new PDPage(new PDRectangle(w, h));
        page.setRotation(rotation);
        doc.addPage(page);
        try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
            content.drawImage(image, 0, 0, w, h);
        }
    }

    /**
     * Degrees clockwise a JPEG has to turn to stand the way it was taken, from its EXIF
     * orientation tag; 0 when it has none or is not a JPEG. Phones save a portrait photo as a
     * landscape image with this tag set to 6.
     */
    static int exifRotation(byte[] b) {
        if (!startsWith(b, JPEG_MAGIC)) return 0;
        int i = 2;
        while (i + 4 <= b.length && (b[i] & 0xFF) == 0xFF) {
            int marker = b[i + 1] & 0xFF;
            if (marker == 0xFF) {
                i++;
                continue;
            }
            // the scan data starts here, and EXIF always comes before it
            if (marker == 0xDA || marker == 0xD9) return 0;
            int length = u16(b, i + 2, false);
            if (length < 2) return 0;
            int body = i + 4;
            int end = Math.min(b.length, i + 2 + length);
            if (marker == 0xE1 && body + 6 <= end && ascii(b, body, 4).equals("Exif") && b[body + 4] == 0
                    && b[body + 5] == 0) {
                return orientationDegrees(b, body + 6, end);
            }
            i += 2 + length;
        }
        return 0;
    }

    private static int orientationDegrees(byte[] b, int tiff, int end) {
        if (tiff + 8 > end) return 0;
        boolean little;
        if (b[tiff] == 'I' && b[tiff + 1] == 'I') little = true;
        else if (b[tiff] == 'M' && b[tiff + 1] == 'M') little = false;
        else return 0;
        long ifd = u32(b, tiff + 4, little) & 0xFFFFFFFFL;
        if (ifd < 8 || tiff + ifd + 2 > end) return 0;
        int at = (int) (tiff + ifd);
        int entries = u16(b, at, little);
        for (int k = 0; k < entries; k++) {
            int entry = at + 2 + k * 12;
            if (entry + 12 > end) return 0;
            if (u16(b, entry, little) == 0x0112) {
                // values 2, 4, 5 and 7 also mirror the picture; a mirror does not stop it being read
                return switch (u16(b, entry + 8, little)) {
                    case 3, 4 -> 180;
                    case 5, 6 -> 90;
                    case 7, 8 -> 270;
                    default -> 0;
                };
            }
        }
        return 0;
    }

    // --- slides: one page each, drawn as the deck draws them -----------------------------------

    private static Conversion slidesPdf(byte[] bytes) throws IOException {
        try (XMLSlideShow show = new XMLSlideShow(new ByteArrayInputStream(bytes));
             PDDocument doc = new PDDocument()) {
            if (show.getSlides().isEmpty()) {
                return new Rejected("This PowerPoint file has no slides.");
            }
            Dimension size = show.getPageSize();
            double scale = SLIDE_WIDTH_PX / size.getWidth();
            int w = (int) Math.round(size.getWidth() * scale);
            int h = (int) Math.round(size.getHeight() * scale);
            // hidden slides stay in, so slide N here is slide N in PowerPoint
            for (XSLFSlide slide : show.getSlides()) {
                BufferedImage drawn = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
                Graphics2D g = drawn.createGraphics();
                try {
                    g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
                    g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
                    g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                    g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
                    g.setRenderingHint(Drawable.FONT_MAP, OfficeFonts.SUBSTITUTES);
                    g.setPaint(Color.WHITE);
                    g.fillRect(0, 0, w, h);
                    g.scale(scale, scale);
                    slide.draw(g);
                } finally {
                    g.dispose();
                }
                PDImageXObject image = JPEGFactory.createFromImage(doc, drawn, SLIDE_JPEG_QUALITY);
                PDPage page = new PDPage(new PDRectangle((float) size.getWidth(), (float) size.getHeight()));
                doc.addPage(page);
                try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
                    content.drawImage(image, 0, 0, page.getMediaBox().getWidth(), page.getMediaBox().getHeight());
                }
            }
            return new Converted(save(doc));
        }
    }

    /**
     * Office fonts that are not installed, mapped to the open fonts drawn to the same metrics,
     * when those are. Without it a Calibri deck on a Linux host falls back to a wider font and
     * its text runs off the slide. Worked out once, on the first deck.
     */
    private static final class OfficeFonts {
        static final Map<String, String> SUBSTITUTES = substitutes();

        private static Map<String, String> substitutes() {
            Set<String> installed = Set.of(
                GraphicsEnvironment.getLocalGraphicsEnvironment().getAvailableFontFamilyNames(Locale.ROOT));
            Map<String, String> wanted = Map.of(
                "Calibri", "Carlito",
                "Calibri Light", "Carlito",
                "Cambria", "Caladea",
                "Arial", "Liberation Sans",
                "Helvetica", "Liberation Sans",
                "Times New Roman", "Liberation Serif",
                "Courier New", "Liberation Mono",
                "Consolas", "Liberation Mono");
            Map<String, String> map = new HashMap<>();
            wanted.forEach((office, open) -> {
                if (!installed.contains(office) && installed.contains(open)) map.put(office, open);
            });
            return Map.copyOf(map);
        }
    }

    // --- documents, web pages and plain text: the words, set as pages --------------------------

    private static String wordText(byte[] bytes) throws IOException {
        try (XWPFWordExtractor extractor = new XWPFWordExtractor(new XWPFDocument(new ByteArrayInputStream(bytes)))) {
            return tidy(extractor.getText());
        }
    }

    /** The readable text of a saved web page: no scripts, menus or forms, one block per line. */
    static String webPageText(byte[] bytes) throws IOException {
        Document page = Jsoup.parse(new ByteArrayInputStream(bytes), null, "");
        page.select("script, style, noscript, template, svg, canvas, iframe, object, nav, form, button").remove();
        StringBuilder out = new StringBuilder();
        String title = page.title().strip();
        if (!title.isEmpty()) out.append(title).append("\n\n");
        NodeTraversor.filter(new NodeFilter() {
            @Override
            public FilterResult head(Node node, int depth) {
                if (node instanceof TextNode text) {
                    out.append(text.text());
                    return FilterResult.CONTINUE;
                }
                if (!(node instanceof Element element)) return FilterResult.CONTINUE;
                switch (element.normalName()) {
                    case "br" -> out.append('\n');
                    case "pre" -> {
                        // code keeps its own line breaks and indentation
                        out.append('\n').append(element.wholeText()).append('\n');
                        return FilterResult.SKIP_ENTIRELY;
                    }
                    case "li" -> out.append("\n• ");
                    case "td", "th" -> out.append('\t');
                    case "img" -> {
                        String alt = element.attr("alt").strip();
                        if (!alt.isEmpty()) out.append("[image: ").append(alt).append(']');
                    }
                    default -> {
                        if (element.isBlock()) out.append('\n');
                    }
                }
                return FilterResult.CONTINUE;
            }

            @Override
            public FilterResult tail(Node node, int depth) {
                if (node instanceof Element element && element.isBlock()) out.append('\n');
                return FilterResult.CONTINUE;
            }
        }, page.body());
        return tidy(out.toString());
    }

    // one line ending, no trailing spaces, and at most one blank line in a row
    static String tidy(String text) {
        String lines = text.replace("\r\n", "\n").replace('\r', '\n').replaceAll("[ \\t\\u00A0]+\n", "\n");
        return lines.replaceAll("\n{3,}", "\n\n").strip();
    }

    private static Conversion textPdf(String text, Kind kind) throws IOException {
        if (text.isBlank()) {
            return new Rejected("This " + kind.noun + " has no text Study OS can read. If it is a scan "
                + "or a picture, upload it as an image or a PDF instead.");
        }
        try (PDDocument doc = new PDDocument()) {
            PDType0Font font;
            try (InputStream in = PDDocument.class.getResourceAsStream(TEXT_FONT)) {
                if (in == null) throw new IOException("PDFBox no longer ships " + TEXT_FONT);
                font = PDType0Font.load(doc, in);
            }
            Map<Integer, Boolean> drawable = new HashMap<>();
            try (TextPages pages = new TextPages(doc, font)) {
                for (String paragraph : text.split("\n", -1)) {
                    List<String> lines = wrap(printable(paragraph, font, drawable), font);
                    if (lines.isEmpty()) pages.skipLine();
                    for (String line : lines) pages.write(line);
                }
            }
            return new Converted(save(doc));
        }
    }

    // a tab as four spaces, no control characters, and '?' for a character the font lacks
    private static String printable(String text, PDType0Font font, Map<Integer, Boolean> drawable) {
        StringBuilder out = new StringBuilder(text.length());
        text.codePoints().forEach(cp -> {
            if (cp == '\t') out.append("    ");
            else if (Character.isISOControl(cp) || cp == 0xFEFF) return;
            else if (drawable.computeIfAbsent(cp, c -> canDraw(font, c))) out.appendCodePoint(cp);
            else out.append('?');
        });
        return out.toString();
    }

    private static boolean canDraw(PDType0Font font, int codePoint) {
        try {
            font.encode(new String(Character.toChars(codePoint)));
            return true;
        } catch (IOException | IllegalArgumentException e) {
            return false;
        }
    }

    // greedy word wrap inside the margins; a word longer than a line (a URL) is cut at the edge
    private static List<String> wrap(String paragraph, PDType0Font font) throws IOException {
        List<String> lines = new ArrayList<>();
        String body = paragraph.stripLeading();
        String indent = paragraph.substring(0, paragraph.length() - body.length());
        StringBuilder line = new StringBuilder(indent);
        boolean empty = true;
        for (String word : body.split(" +")) {
            if (word.isEmpty()) continue;
            String candidate = empty ? line + word : line + " " + word;
            if (width(candidate, font) <= TEXT_WIDTH) {
                line.setLength(0);
                line.append(candidate);
                empty = false;
                continue;
            }
            if (!empty) lines.add(line.toString());
            line.setLength(0);
            String rest = word;
            while (width(rest, font) > TEXT_WIDTH) {
                int cut = fitting(rest, font);
                lines.add(rest.substring(0, cut));
                rest = rest.substring(cut);
            }
            line.append(rest);
            empty = rest.isEmpty();
        }
        if (!empty) lines.add(line.toString());
        return lines;
    }

    // how many chars of the word fit on one line, at least one code point
    private static int fitting(String word, PDType0Font font) throws IOException {
        int end = word.offsetByCodePoints(0, 1);
        while (end < word.length()) {
            int next = word.offsetByCodePoints(end, 1);
            if (width(word.substring(0, next), font) > TEXT_WIDTH) break;
            end = next;
        }
        return end;
    }

    private static float width(String text, PDType0Font font) throws IOException {
        return font.getStringWidth(text) / 1000f * FONT_SIZE;
    }

    /** Lines of text poured onto Letter pages, a new page when one fills. */
    private static final class TextPages implements Closeable {
        private final PDDocument doc;
        private final PDType0Font font;
        private PDPageContentStream content;
        private float y;

        TextPages(PDDocument doc, PDType0Font font) {
            this.doc = doc;
            this.font = font;
        }

        void write(String line) throws IOException {
            if (content == null || y < MARGIN) newPage();
            content.beginText();
            content.setFont(font, FONT_SIZE);
            content.newLineAtOffset(MARGIN, y);
            content.showText(line);
            content.endText();
            y -= LEADING;
        }

        // a blank line between paragraphs; one at the top of a fresh page is dropped
        void skipLine() {
            if (content != null) y -= LEADING;
        }

        private void newPage() throws IOException {
            close();
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            content = new PDPageContentStream(doc, page);
            y = PDRectangle.LETTER.getHeight() - MARGIN - FONT_SIZE;
        }

        @Override
        public void close() throws IOException {
            if (content != null) {
                content.close();
                content = null;
            }
        }
    }

    // --- bytes ---------------------------------------------------------------------------------

    private static byte[] save(PDDocument doc) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        doc.save(out);
        return out.toByteArray();
    }

    private static boolean startsWith(byte[] bytes, byte[] magic) {
        if (bytes == null || bytes.length < magic.length) return false;
        for (int i = 0; i < magic.length; i++) {
            if (bytes[i] != magic[i]) return false;
        }
        return true;
    }

    private static String ascii(byte[] b, int from, int length) {
        return new String(b, from, length, StandardCharsets.ISO_8859_1);
    }

    private static int u16(byte[] b, int at, boolean little) {
        int first = b[at] & 0xFF;
        int second = b[at + 1] & 0xFF;
        return little ? first | second << 8 : first << 8 | second;
    }

    private static int u32(byte[] b, int at, boolean little) {
        int low = u16(b, little ? at : at + 2, little);
        int high = u16(b, little ? at + 2 : at, little);
        return high << 16 | low;
    }
}
