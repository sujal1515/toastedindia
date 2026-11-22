import { Bowlby_One, Instrument_Serif, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Bowlby_One({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Space_Grotesk({ subsets: ["latin"], variable: "--font-body" });
// an elegant serif for the age gate
const serif = Instrument_Serif({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-serif" });

export const metadata = {
  title: "Toasted India — Rolling Papers & Trays",
  description:
    "Toasted: premium watermarked rolling papers and rolling trays. Top quality, chemical free, ultra thin. For adults 18+ only.",
  icons: { icon: "/logo.jpg" },
};

export const viewport = {
  themeColor: "#3a2f5f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
