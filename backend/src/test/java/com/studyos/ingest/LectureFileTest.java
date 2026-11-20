package com.studyos.ingest;

import static org.junit.jupiter.api.Assertions.*;

import com.studyos.ingest.LectureFile.Converted;
import com.studyos.ingest.LectureFile.Conversion;
import com.studyos.ingest.LectureFile.Kind;
import com.studyos.ingest.LectureFile.Rejected;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.sl.usermodel.Placeholder;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFNotes;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.apache.poi.xslf.usermodel.XSLFTextBox;
import org.apache.poi.xslf.usermodel.XSLFTextShape;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.Test;

class LectureFileTest {

    // --- what the bytes are --------------------------------------------------------------------

    @Test
    void aPdfIsPassedThroughUntouched() throws IOException {
        byte[] pdf = pdfWithPages(2);
        Converted converted = assertInstanceOf(Converted.class, LectureFile.toPdf(pdf, "week1.pdf"));
        assertSame(pdf, converted.pdf());
    }

    @Test
    void theBytesDecideTheKindAndTheExtensionDoesNot() throws IOException {
        assertEquals(Kind.SLIDES, LectureFile.detect(pptx("One"), "deck.pdf"));
        assertEquals(Kind.PDF, LectureFile.detect(pdfWithPages(1), "deck.pptx"));
        assertEquals(Kind.WORD, LectureFile.detect(docx("Notes"), "notes.zip"));
        assertEquals(Kind.PICTURE, LectureFile.detect(png(20, 10), "photo.jpg"));
    }

    @Test
    void eachPictureFormatIsRecognizedByItsHeader() throws IOException {
        assertEquals(Kind.PICTURE, LectureFile.detect(jpeg(20, 10), "a"));
        assertEquals(Kind.PICTURE, LectureFile.detect(picture("gif", 20, 10), "a"));
        assertEquals(Kind.PICTURE, LectureFile.detect(picture("bmp", 20, 10), "a"));
        assertEquals(Kind.PICTURE, LectureFile.detect(picture("tiff", 20, 10), "a"));
        byte[] webp = ascii("RIFF\0\0\0\0WEBPVP8 ");
        assertEquals(Kind.PICTURE, LectureFile.detect(webp, "a"));
    }

    @Test
    void formatsItCannotReadAreNamedWithWhatToDoInstead() throws IOException {
        assertRefused(ascii("\0\0\0\u0018ftypheic\0\0\0\0"), "IMG_0042.HEIC", "JPEG");
        assertRefused(new byte[] {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A,
            (byte) 0xE1, 0, 0}, "old.ppt", ".pptx");
        assertRefused(xlsx(), "grades.xlsx", "spreadsheet");
        assertRefused(ascii("{\\rtf1\\ansi hello}"), "notes.rtf", "Word");
        assertRefused(ascii("From: <Saved by Blink>\nMIME-Version: 1.0\n"), "page.mhtml", "HTML only");
        assertRefused(new byte[] {0x00, 0x00, 0x00, 0x20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}, "clip.mp4",
            "cannot read this kind of file");
        assertRefused(new byte[0], "empty.pdf", "empty");
    }

    @Test
    void aDamagedPowerPointSaysItCouldNotOpenAPowerPoint() {
        byte[] truncated = {'P', 'K', 0x03, 0x04, 0x14, 0x00, 0x06, 0x00};
        Rejected rejected = assertInstanceOf(Rejected.class, LectureFile.toPdf(truncated, "lecture.pptx"));
        assertTrue(rejected.message().contains("PowerPoint"), rejected.message());
    }

    // --- slides --------------------------------------------------------------------------------

    @Test
    void aPowerPointBecomesOnePagePerSlideInTheDecksShape() throws IOException {
        byte[] deck = pptx("Processes", "Threads", "Locks");
        try (PDDocument pdf = converted(deck, "CS149 week 3.pptx")) {
            assertEquals(3, pdf.getNumberOfPages());
            PDPage first = pdf.getPage(0);
            // a 16:9 deck is 960 x 540 points
            assertEquals(960f, first.getMediaBox().getWidth(), 1f);
            assertEquals(540f, first.getMediaBox().getHeight(), 1f);
        }
    }

    @Test
    void speakerNotesSitUnderTheirSlideOnTheSamePage() throws IOException {
        byte[] deck = pptxWithNotes(new String[] {"Paging", "TLB", "Faults"},
            new String[] {null, "The TLB caches recent page table entries.", null});
        try (PDDocument pdf = converted(deck, "week 5.pptx")) {
            // page N is still slide N, so a citation of slide 3 still finds slide 3
            assertEquals(3, pdf.getNumberOfPages());
            String second = pageText(pdf, 2);
            assertTrue(second.contains("The TLB caches recent page table entries."), second);
            assertTrue(second.contains("Speaker notes"), second);
            assertFalse(pageText(pdf, 1).contains("TLB caches"));
            assertFalse(pageText(pdf, 3).contains("TLB caches"));
            assertFalse(pageText(pdf, 1).contains("Speaker notes"));
        }
    }

    @Test
    void aSlideWithoutNotesKeepsTheDecksShapeAndOneWithNotesGrowsDownward() throws IOException {
        byte[] deck = pptxWithNotes(new String[] {"One", "Two"}, new String[] {null, "Say the two cases."});
        try (PDDocument pdf = converted(deck, "deck.pptx")) {
            PDPage plain = pdf.getPage(0);
            assertEquals(960f, plain.getMediaBox().getWidth(), 1f);
            assertEquals(540f, plain.getMediaBox().getHeight(), 1f);
            PDPage noted = pdf.getPage(1);
            assertEquals(960f, noted.getMediaBox().getWidth(), 1f);
            assertTrue(noted.getMediaBox().getHeight() > 540f, "notes page: " + noted.getMediaBox());
        }
    }

    @Test
    void theNotesPagesNumberDateAndFooterAreNotTakenForNotes() throws IOException {
        XSLFSlide[] slide = new XSLFSlide[1];
        byte[] deck = deck(show -> {
            slide[0] = show.createSlide();
            XSLFNotes notes = show.getNotesSlide(slide[0]);
            for (XSLFTextShape box : notes.getPlaceholders()) {
                if (box.getTextType() == Placeholder.BODY) box.setText("What the lecturer says.");
            }
            // a notes page's footer, drawn by hand the way a template might leave it
            XSLFTextBox footer = notes.createTextBox();
            footer.setPlaceholder(Placeholder.FOOTER);
            footer.setText("Confidential - do not distribute");
        });
        try (XMLSlideShow show = new XMLSlideShow(new java.io.ByteArrayInputStream(deck))) {
            String notes = LectureFile.speakerNotes(show.getSlides().get(0));
            assertEquals("What the lecturer says.", notes);
        }
    }

    @Test
    void notesTooLongForTheBandStopWithALineSayingTheyContinue() throws IOException {
        String essay = "Virtual memory lets each process see its own address space. ".repeat(600);
        byte[] deck = pptxWithNotes(new String[] {"Memory"}, new String[] {essay});
        try (PDDocument pdf = converted(deck, "long.pptx")) {
            assertEquals(1, pdf.getNumberOfPages());
            // at most the slide again under the slide
            assertTrue(pdf.getPage(0).getMediaBox().getHeight() <= 2 * 540f + 1f, "" + pdf.getPage(0).getMediaBox());
            String text = pageText(pdf, 1);
            assertTrue(text.contains("Virtual memory lets each process"), text.substring(0, 100));
            assertTrue(text.contains("The speaker notes continue in the PowerPoint file."), text);
        }
    }

    @Test
    void aPowerPointWithNoSlidesIsRefused() throws IOException {
        Rejected rejected = assertInstanceOf(Rejected.class, LectureFile.toPdf(pptx(), "empty.pptx"));
        assertTrue(rejected.message().contains("no slides"), rejected.message());
    }

    // --- documents, web pages and text ---------------------------------------------------------

    @Test
    void aWordFileKeepsItsText() throws IOException {
        try (PDDocument pdf = converted(docx("Deadlock needs four conditions.", "Mutual exclusion is one."),
                "notes.docx")) {
            String text = new PDFTextStripper().getText(pdf);
            assertTrue(text.contains("Deadlock needs four conditions."), text);
            assertTrue(text.contains("Mutual exclusion is one."), text);
        }
    }

    @Test
    void aWebPageKeepsItsTextAndDropsScriptsAndMenus() throws IOException {
        String html = """
            <!DOCTYPE html><html><head><title>Paging</title><style>p{color:red}</style></head>
            <body><nav>Home | Courses</nav><h1>Page tables</h1>
            <p>A page table maps <b>virtual</b> pages to frames.</p>
            <ul><li>TLB</li><li>Multi-level</li></ul>
            <pre>int x = 1;
              x++;</pre>
            <script>alert('tracking')</script></body></html>""";
        String text = LectureFile.webPageText(html.getBytes(StandardCharsets.UTF_8));
        assertTrue(text.startsWith("Paging"), text);
        assertTrue(text.contains("A page table maps virtual pages to frames."), text);
        assertTrue(text.contains("• TLB"), text);
        assertTrue(text.contains("\n  x++;"), text);
        assertFalse(text.contains("alert"), text);
        assertFalse(text.contains("Home | Courses"), text);
        assertFalse(text.contains("color:red"), text);
        assertEquals(Kind.WEB_PAGE, LectureFile.detect(html.getBytes(StandardCharsets.UTF_8), "saved"));
        try (PDDocument pdf = converted(html.getBytes(StandardCharsets.UTF_8), "paging.html")) {
            assertTrue(new PDFTextStripper().getText(pdf).contains("Page tables"));
        }
    }

    @Test
    void longNotesWrapAndRunOntoMorePages() throws IOException {
        String paragraph = "The scheduler picks the next process to run on the CPU. ".repeat(40);
        String notes = (paragraph + "\n\n").repeat(12);
        try (PDDocument pdf = converted(notes.getBytes(StandardCharsets.UTF_8), "notes.md")) {
            assertTrue(pdf.getNumberOfPages() > 1, "pages: " + pdf.getNumberOfPages());
            String text = new PDFTextStripper().getText(pdf);
            assertTrue(text.contains("The scheduler picks the next process"), text.substring(0, 200));
        }
    }

    @Test
    void aCharacterTheFontLacksBecomesAQuestionMarkInsteadOfFailingTheUpload() throws IOException {
        byte[] notes = "Kanji 漢字 and été with a tab\tafter".getBytes(StandardCharsets.UTF_8);
        try (PDDocument pdf = converted(notes, "notes.txt")) {
            String text = new PDFTextStripper().getText(pdf);
            assertTrue(text.contains("Kanji ??"), text);
            assertTrue(text.contains("été"), text);
        }
    }

    @Test
    void textSavedByAnOlderWindowsEditorStillReads() throws IOException {
        byte[] cp1252 = {'c', 'a', 'f', (byte) 0xE9, ' ', (byte) 0x93, 'q', (byte) 0x94};
        try (PDDocument pdf = converted(cp1252, "notes.txt")) {
            assertTrue(new PDFTextStripper().getText(pdf).contains("café “q”"));
        }
    }

    @Test
    void aFileWithNoTextIsRefused() {
        Rejected rejected = assertInstanceOf(Rejected.class,
            LectureFile.toPdf(" \n\n \t ".getBytes(StandardCharsets.UTF_8), "blank.txt"));
        assertTrue(rejected.message().contains("no text"), rejected.message());
    }

    // --- pictures ------------------------------------------------------------------------------

    @Test
    void aPictureBecomesOnePageInItsOwnShape() throws IOException {
        try (PDDocument pdf = converted(png(400, 200), "whiteboard.png")) {
            assertEquals(1, pdf.getNumberOfPages());
            PDPage page = pdf.getPage(0);
            assertEquals(2f, page.getMediaBox().getWidth() / page.getMediaBox().getHeight(), 0.01f);
        }
    }

    @Test
    void aPortraitPhoneJpegStandsUpright() throws IOException {
        // stored 400 x 200 like a phone sensor, tagged "turn 90 degrees clockwise to view"
        byte[] photo = withExifOrientation(jpeg(400, 200), 6);
        assertEquals(90, LectureFile.exifRotation(photo));
        try (PDDocument pdf = converted(photo, "IMG_0042.jpg")) {
            PDPage page = pdf.getPage(0);
            assertTrue(page.getMediaBox().getHeight() > page.getMediaBox().getWidth(),
                "the page should be portrait: " + page.getMediaBox());
        }
    }

    @Test
    void theOrientationTagIsReadInBothByteOrders() throws IOException {
        assertEquals(180, LectureFile.exifRotation(withExifOrientation(jpeg(10, 10), 3)));
        assertEquals(270, LectureFile.exifRotation(withExifOrientationLittleEndian(jpeg(10, 10), 8)));
        assertEquals(0, LectureFile.exifRotation(jpeg(10, 10)));
        assertEquals(0, LectureFile.exifRotation(png(10, 10)));
    }

    @Test
    void everyPageOfATiffScanBecomesAPage() throws IOException {
        try (PDDocument pdf = converted(tiffPages(3), "scan.tif")) {
            assertEquals(3, pdf.getNumberOfPages());
        }
    }

    // --- several photos as one lecture ----------------------------------------------------------

    @Test
    void photosBecomeOneUprightPagePerPhotoInTheOrderSent() throws IOException {
        // wide, tall, then a phone photo stored wide but tagged to stand up: the shapes give the order
        byte[] wide = png(400, 200);
        byte[] tall = png(200, 400);
        byte[] phone = withExifOrientation(jpeg(300, 100), 6);
        Conversion conversion = LectureFile.picturesPdf(List.of(wide, tall, phone),
            List.of("board-1.png", "board-2.png", "IMG_0042.jpg"));
        try (PDDocument pdf = Loader.loadPDF(assertInstanceOf(Converted.class, conversion).pdf())) {
            assertEquals(3, pdf.getNumberOfPages());
            assertEquals(2f, aspect(pdf.getPage(0)), 0.01f);
            assertEquals(0.5f, aspect(pdf.getPage(1)), 0.01f);
            assertEquals(1 / 3f, aspect(pdf.getPage(2)), 0.01f);
        }
    }

    @Test
    void aFileInTheSetThatIsNotAPictureRefusesTheSetAndNamesTheFile() throws IOException {
        Rejected rejected = assertInstanceOf(Rejected.class, LectureFile.picturesPdf(
            List.of(png(40, 20), pdfWithPages(1), png(40, 20)), List.of("a.png", "handout.pdf", "c.png")));
        assertTrue(rejected.message().startsWith("Photo 2 (\"handout.pdf\") is not a picture"), rejected.message());
        assertTrue(rejected.message().contains("send the photos again"), rejected.message());
    }

    @Test
    void aHeicPhotoInTheSetSaysHowToExportIt() throws IOException {
        Rejected rejected = assertInstanceOf(Rejected.class, LectureFile.picturesPdf(
            List.of(png(40, 20), ascii("\0\0\0\u0018ftypheic\0\0\0\0")), List.of("a.png", "IMG_7.HEIC")));
        assertTrue(rejected.message().contains("IMG_7.HEIC"), rejected.message());
        assertTrue(rejected.message().contains("JPEG"), rejected.message());
    }

    @Test
    void aDamagedPhotoInTheSetIsNamedByPositionWhenItHasNoName() {
        byte[] cutShort = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13};
        Rejected rejected = assertInstanceOf(Rejected.class, LectureFile.picturesPdf(
            List.of(cutShort, cutShort), java.util.Arrays.asList(null, null)));
        assertTrue(rejected.message().startsWith("Photo 1 could not be opened"), rejected.message());
    }

    // --- helpers -------------------------------------------------------------------------------

    private static float aspect(PDPage page) {
        return page.getMediaBox().getWidth() / page.getMediaBox().getHeight();
    }

    private static String pageText(PDDocument pdf, int page) throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(page);
        stripper.setEndPage(page);
        return stripper.getText(pdf);
    }

    private interface DeckBuilder {
        void build(XMLSlideShow show) throws IOException;
    }

    private static byte[] deck(DeckBuilder builder) throws IOException {
        try (XMLSlideShow show = new XMLSlideShow(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            show.setPageSize(new Dimension(960, 540));
            builder.build(show);
            show.write(out);
            return out.toByteArray();
        }
    }

    // a deck of titled slides; notes[i] is slide i's speaker notes, or null for none
    private static byte[] pptxWithNotes(String[] titles, String[] notes) throws IOException {
        return deck(show -> {
            for (int i = 0; i < titles.length; i++) {
                XSLFSlide slide = show.createSlide();
                XSLFTextBox box = slide.createTextBox();
                box.setAnchor(new Rectangle(60, 60, 800, 100));
                box.setText(titles[i]);
                if (notes[i] == null) continue;
                for (XSLFTextShape body : show.getNotesSlide(slide).getPlaceholders()) {
                    if (body.getTextType() == Placeholder.BODY) body.setText(notes[i]);
                }
            }
        });
    }

    private static PDDocument converted(byte[] bytes, String filename) throws IOException {
        Conversion conversion = LectureFile.toPdf(bytes, filename);
        if (conversion instanceof Rejected rejected) fail("refused: " + rejected.message());
        return Loader.loadPDF(((Converted) conversion).pdf());
    }

    private static void assertRefused(byte[] bytes, String filename, String hint) {
        Rejected rejected = assertInstanceOf(Rejected.class, LectureFile.toPdf(bytes, filename), filename);
        assertTrue(rejected.message().contains(hint), filename + ": " + rejected.message());
    }

    private static byte[] ascii(String s) {
        return s.getBytes(StandardCharsets.ISO_8859_1);
    }

    private static byte[] pdfWithPages(int pages) throws IOException {
        try (PDDocument doc = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) doc.addPage(new PDPage());
            doc.save(out);
            return out.toByteArray();
        }
    }

    static byte[] pptx(String... slideTitles) throws IOException {
        try (XMLSlideShow show = new XMLSlideShow(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            show.setPageSize(new Dimension(960, 540));
            for (String title : slideTitles) {
                XSLFSlide slide = show.createSlide();
                XSLFTextBox box = slide.createTextBox();
                box.setAnchor(new Rectangle(60, 60, 800, 100));
                box.setText(title);
            }
            show.write(out);
            return out.toByteArray();
        }
    }

    private static byte[] docx(String... paragraphs) throws IOException {
        try (XWPFDocument doc = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            for (String text : paragraphs) doc.createParagraph().createRun().setText(text);
            doc.write(out);
            return out.toByteArray();
        }
    }

    private static byte[] xlsx() throws IOException {
        try (XSSFWorkbook book = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            book.createSheet("Grades").createRow(0).createCell(0).setCellValue("A");
            book.write(out);
            return out.toByteArray();
        }
    }

    private static BufferedImage drawing(int w, int h) {
        BufferedImage image = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, w, h);
        g.setColor(Color.BLACK);
        g.fillRect(0, 0, w / 4, h / 4);
        g.dispose();
        return image;
    }

    private static byte[] picture(String format, int w, int h) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        assertTrue(ImageIO.write(drawing(w, h), format, out), "no writer for " + format);
        return out.toByteArray();
    }

    static byte[] png(int w, int h) throws IOException {
        return picture("png", w, h);
    }

    private static byte[] jpeg(int w, int h) throws IOException {
        return picture("jpeg", w, h);
    }

    private static byte[] tiffPages(int pages) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("tiff").next();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ImageOutputStream stream = ImageIO.createImageOutputStream(out)) {
            writer.setOutput(stream);
            writer.prepareWriteSequence(null);
            for (int i = 0; i < pages; i++) writer.writeToSequence(new IIOImage(drawing(60, 80), null, null), null);
            writer.endWriteSequence();
        } finally {
            writer.dispose();
        }
        return out.toByteArray();
    }

    // an APP1 EXIF segment holding only the orientation tag, spliced in after the JPEG's SOI
    private static byte[] withExifOrientation(byte[] jpeg, int orientation) {
        byte[] tiff = {
            'M', 'M', 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08,   // big-endian, IFD0 at 8
            0x00, 0x01,                                       // one entry
            0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01,   // Orientation, SHORT, count 1
            0x00, (byte) orientation, 0x00, 0x00,             // the value
            0x00, 0x00, 0x00, 0x00};                          // no next IFD
        return splice(jpeg, tiff);
    }

    private static byte[] withExifOrientationLittleEndian(byte[] jpeg, int orientation) {
        byte[] tiff = {
            'I', 'I', 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00,
            0x01, 0x00,
            0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
            (byte) orientation, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00};
        return splice(jpeg, tiff);
    }

    private static byte[] splice(byte[] jpeg, byte[] tiff) {
        byte[] exif = new byte[6 + tiff.length];
        System.arraycopy("Exif\0\0".getBytes(StandardCharsets.ISO_8859_1), 0, exif, 0, 6);
        System.arraycopy(tiff, 0, exif, 6, tiff.length);
        int length = exif.length + 2;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(jpeg, 0, 2);
        out.write(0xFF);
        out.write(0xE1);
        out.write(length >> 8);
        out.write(length & 0xFF);
        out.write(exif, 0, exif.length);
        out.write(jpeg, 2, jpeg.length - 2);
        return out.toByteArray();
    }
}
