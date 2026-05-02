import { useEffect, useRef } from 'react';

const useExamSecurity = (isActive = true) => {
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!isActive) return;

    // منع النسخ واللصق والقص
    const preventCopyPaste = (e) => {
      e.preventDefault();
      return false;
    };

    // منع النقر الأيمن
    const preventRightClick = (e) => {
      e.preventDefault();
      return false;
    };

    // منع اختصارات لوحة المفاتيح
    const preventKeyboardShortcuts = (e) => {
      // منع Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Ctrl+S, Ctrl+P
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'c':
          case 'v':
          case 'x':
          case 'a':
          case 's':
          case 'p':
            e.preventDefault();
            return false;
        }
      }
      
      // منع F12 (أدوات المطور)
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }
      
      // منع Ctrl+Shift+I (أدوات المطور)
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        return false;
      }
      
      // منع Ctrl+Shift+J (كونسول)
      if (e.ctrlKey && e.shiftKey && e.key === 'J') {
        e.preventDefault();
        return false;
      }
      
      // منع Ctrl+Shift+C (فحص العنصر)
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        return false;
      }
      
      // منع Print Screen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        return false;
      }
    };

    // منع السحب والإفلات
    const preventDragDrop = (e) => {
      e.preventDefault();
      return false;
    };

    // منع تحديد النص
    const preventSelection = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      return false;
    };

    // إخفاء الصفحة عند فقدان التركيز (منع لقطات الشاشة)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        document.body.style.display = 'none';
        setTimeout(() => {
          document.body.style.display = 'block';
          alert('⚠️ تم اكتشاف محاولة لقطة شاشة! سيتم تسجيل هذا الحدث.');
        }, 100);
      }
    };

    // منع الخروج من النافذة أثناء الاختبار
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'هل أنت متأكد من أنك تريد مغادرة الاختبار؟ سيتم فقدان تقدمك.';
      return e.returnValue;
    };

    // تطبيق جميع الإجراءات الأمنية
    const applySecurity = () => {
      // منع النسخ واللصق
      document.addEventListener('copy', preventCopyPaste);
      document.addEventListener('paste', preventCopyPaste);
      document.addEventListener('cut', preventCopyPaste);
      
      // منع النقر الأيمن
      document.addEventListener('contextmenu', preventRightClick);
      
      // منع اختصارات لوحة المفاتيح
      document.addEventListener('keydown', preventKeyboardShortcuts);
      
      // منع السحب والإفلات
      document.addEventListener('dragstart', preventDragDrop);
      document.addEventListener('drop', preventDragDrop);
      
      // منع تحديد النص
      document.addEventListener('selectstart', preventSelection);
      document.addEventListener('mousedown', preventSelection);
      
      // مراقبة فقدان التركيز
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // منع الخروج من الصفحة
      window.addEventListener('beforeunload', handleBeforeUnload);
      
      // إضافة أنماط CSS لمنع التحديد
      const style = document.createElement('style');
      style.textContent = `
        * {
          -webkit-user-select: none !important;
          -moz-user-select: none !important;
          -ms-user-select: none !important;
          user-select: none !important;
          -webkit-touch-callout: none !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        
        input, textarea {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
        }
      `;
      document.head.appendChild(style);
    };

    // إزالة الإجراءات الأمنية
    const removeSecurity = () => {
      document.removeEventListener('copy', preventCopyPaste);
      document.removeEventListener('paste', preventCopyPaste);
      document.removeEventListener('cut', preventCopyPaste);
      document.removeEventListener('contextmenu', preventRightClick);
      document.removeEventListener('keydown', preventKeyboardShortcuts);
      document.removeEventListener('dragstart', preventDragDrop);
      document.removeEventListener('drop', preventDragDrop);
      document.removeEventListener('selectstart', preventSelection);
      document.removeEventListener('mousedown', preventSelection);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // إزالة أنماط CSS
      const styleElement = document.querySelector('style[data-exam-security]');
      if (styleElement) {
        styleElement.remove();
      }
    };

    // تطبيق الأمان عند بدء الاختبار
    applySecurity();

    // فحص دوري للتأكد من عدم فتح أدوات المطور
    intervalRef.current = setInterval(() => {
      const devtools = /./;
      devtools.toString = function() {
        alert('⚠️ تم اكتشاف فتح أدوات المطور! سيتم تسجيل هذا الحدث.');
        return '';
      };
      
      // التحقق من حجم النافذة (قد يدل على أدوات المطور)
      if (window.outerHeight - window.innerHeight > 200 || window.outerWidth - window.innerWidth > 200) {
        console.warn('Developer tools detected!');
      }
    }, 1000);

    // تنظيف عند إلغاء المكون
    return () => {
      removeSecurity();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive]);

  return {
    // يمكن إضافة المزيد من الوظائف الأمنية هنا
  };
};

export default useExamSecurity;
