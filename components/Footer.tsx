// /components/Footer.tsx
export default function Footer() {
  return (
    <footer className="w-full border-t mt-16 py-8 bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 flex flex-col items-center gap-3 text-sm text-gray-600">

        {/* Copyright */}
        <p className="text-center">
          © 2024 <span className="font-semibold">CrustHack</span>.  
          <span className="ml-1 opacity-80">All rights not reserved.</span>
        </p>

        {/* Contact */}
        <a
          href="mailto:crusthack@gmail.com"
          className="
            inline-flex items-center gap-2
            px-3 py-1.5
            rounded-full
            border border-gray-300
            text-gray-600
            hover:bg-gray-100 hover:text-gray-900
            transition
          "
        >
          이메일: crusthack@gmail.com
        </a>

      </div>
    </footer>
  );
}
