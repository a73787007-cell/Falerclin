import "./globals.css";

export const metadata = {
  title: "Fursona Studio",
  description: "Интерактивная анкета персонажа с рисованием и галереей образов.",
  applicationName: "Fursona Studio",
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08070c",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
