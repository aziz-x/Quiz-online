import React, { useState, useContext } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, ExternalLink, Sun, Moon } from 'lucide-react';
import { AdminContext } from '../context/AdminContext';
import { ThemeContext } from '../context/ThemeContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginType, setLoginType] = useState('doctor');
  const [hasReadTerms, setHasReadTerms] = useState(true); // حالة جديدة لتتبع قراءة الشروط
  const navigate = useNavigate();

  // استخدام دالة setToken الموحدة
  const { setToken, setid_doctor, setid, setloginType } = useContext(AdminContext);
  const { isDarkMode, toggleTheme, isToggling } = useContext(ThemeContext);
  
  // Debug: Check if theme context is working
  console.log('Theme context:', { isDarkMode, isToggling });

  const onSubmitHandler = async (event) => {
    event.preventDefault();
    
    // التحقق من قراءة الشروط والأحكام
    if (!hasReadTerms) {
      toast.error('يجب قراءة والموافقة على الشروط والأحكام أولاً');
      return;
    }

    setIsLoading(true);

    try {
      let endpoint = '';

      if (loginType === 'doctor') {
        endpoint = 'https://https://backend.quiz/api/login';
      } else {
        endpoint = 'https://https://backend.quiz/api/login';
      }

      console.log('محاولة تسجيل الدخول:', { email, loginType }); // لوج للتتبع

      const { data } = await axios.post(endpoint, { email, password });

      console.log('استجابة الخادم:', data); // لوج للتتبع

      if (data.success === true) {
        // استخدام التوكن الموحد
        setToken(data.token);
        setid_doctor(data.doctorId);
        setid(data.id || data.employeeId || data.doctorId);
        setloginType(loginType);

        // تخزين البيانات في localStorage
        localStorage.setItem('token', data.token);
        localStorage.setItem('id_doctor', data.doctorId || '');
        localStorage.setItem('id', data.id || data.employeeId || data.doctorId);
        localStorage.setItem('loginType', loginType);

        toast.success(data.message || 'تم تسجيل الدخول بنجاح');
        navigate('/');
      } else {
        // عرض رسالة الخطأ من الخادم
        toast.error(data.message || 'فشل في تسجيل الدخول');
        console.log('فشل تسجيل الدخول:', data.message);
      }
    } catch (error) {
      console.error('خطأ في تسجيل الدخول:', error);
      
      // التعامل مع أخطاء مختلفة
      if (error.response) {
        // الخادم رد بخطأ
        toast.error(error.response.data?.message || 'حدث خطأ في الخادم');
      } else if (error.request) {
        // لا يوجد استجابة من الخادم
        toast.error('لا يمكن الاتصال بالخادم. تأكد من تشغيل الخادم');
      } else {
        // خطأ في إعداد الطلب
        toast.error('حدث خطأ غير متوقع');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // دالة لفتح رابط الشروط والأحكام
  const handleReadTerms = () => {
    setHasReadTerms(true);
  };

  return (
    <section className="relative flex min-h-screen bg-gradient-to-br ">
      <div className="relative w-full px-8 py-12 sm:px-16 sm:py-16 lg:w-1/2 lg:px-8 lg:py-24 flex items-center">
        <div className="relative mx-auto w-full max-w-xl">
          <div className="backdrop-blur-lg bg-white/90 dark:bg-gray-800/90 rounded-2xl shadow-xl p-8 space-y-8 ">
            {/* زر تبديل الوضع الليلي/النهاري في الأعلى */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={toggleTheme}
                disabled={isToggling}
                className={`px-4 py-2 rounded-lg transition-all duration-300 flex items-center gap-2 shadow-lg ${
                  isToggling 
                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed' 
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
                aria-label="تبديل الوضع"
              >
                {isToggling ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>جاري التغيير...</span>
                  </>
                ) : isDarkMode ? (
                  <>
                    <Sun className="w-5 h-5 text-yellow-300" />
                    <span>وضع نهاري</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-5 h-5 text-white" />
                    <span>وضع ليلي</span>
                  </>
                )}
              </button>
            </div>
            
            {/* زر تبديل الوضع الليلي/النهاري كبير وواضح */}
            <div className="text-center">
              <button
                type="button"
                onClick={toggleTheme}
                disabled={isToggling}
                className={`px-8 py-4 text-lg font-bold rounded-xl transition-all duration-300 flex items-center gap-3 mx-auto shadow-xl ${
                  isToggling 
                    ? 'bg-red-500 text-white cursor-not-allowed' 
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transform hover:scale-105'
                }`}
                aria-label="تبديل الوضع"
              >
                {isToggling ? (
                  <>
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>جاري التغيير...</span>
                  </>
                ) : isDarkMode ? (
                  <>
                    <Sun className="w-6 h-6 text-yellow-300" />
                    <span>☀️ تحويل إلى الوضع النهاري</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-6 h-6 text-white" />
                    <span>🌙 تحويل إلى الوضع الليلي</span>
                  </>
                )}
              </button>
            </div>
            
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                مرحباً بك
              </h1>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                تسجيل الدخول إلى حساب {loginType === 'doctor' ? 'الالمدير' : 'الموظف'}
              </p>
            </div>

            {/* أزرار تبديل نوع تسجيل الدخول */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setLoginType('doctor')}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    loginType === 'doctor'
                      ? 'bg-primary text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  تسجيل دخول المدير
                </button>
                <button
                  type="button"
                  onClick={() => setLoginType('employee')}
                  className={`px-4 py-2 rounded-lg transition-all ${
                    loginType === 'employee'
                      ? 'bg-primary text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                  }`}
                >
                  تسجيل دخول موظف
                </button>
              </div>
              
              {/* زر تبديل الوضع الليلي/النهاري */}
              <button
                type="button"
                onClick={toggleTheme}
                className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all duration-300 flex items-center gap-2"
                aria-label="تبديل الوضع"
              >
                {isDarkMode ? (
                  <>
                    <Sun className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm">نهاري</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-4 h-4 text-gray-600" />
                    <span className="text-sm">ليلي</span>
                  </>
                )}
              </button>
            </div>

            <form onSubmit={onSubmitHandler} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Mail size={16} className="text-gray-500 dark:text-gray-400" />
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-4 pe-12 text-sm shadow-sm transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900 dark:text-gray-100"
                    placeholder="name@example.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <Lock size={16} className="text-gray-500 dark:text-gray-400" />
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-4 pe-12 text-sm shadow-sm transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary text-gray-900 dark:text-gray-100"
                    placeholder="أدخل كلمة المرور"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 grid place-content-center px-4 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col space-y-3 text-sm">
                {/* زر قراءة الشروط والأحكام */}
                <div className="flex items-center justify-between">
                  {/* <button
                    type="button"
                    onClick={handleReadTerms}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                      hasReadTerms 
                        ? 'bg-green-100 text-green-700 border border-green-300' 
                        : 'bg-primary text-white hover:bg-primary/90'
                    }`}
                  >
                    <ExternalLink size={16} />
                    {hasReadTerms ? 'تم قراءة الشروط والأحكام ✓' : 'اقرأ الشروط والأحكام'}
                  </button> */}
                  
                  <a 
                    onClick={() => navigate('/forget-Password')} 
                    className="text-primary cursor-pointer hover:text-primary/80"
                  >
                    نسيت كلمة المرور؟
                  </a>
                </div>

                {/* رسالة تأكيد قراءة الشروط */}
                {/* {hasReadTerms && (
                  <div className="text-xs text-green-600 text-center">
                    شكراً لك على قراءة الشروط والأحكام. يمكنك الآن تسجيل الدخول.
                  </div>
                )} */}

                {/* رسالة تحذير إذا لم يتم قراءة الشروط */}
                {/* {!hasReadTerms && (
                  <div className="text-xs text-yellow-400 text-center">
                    يجب قراءة والموافقة على الشروط والأحكام قبل تسجيل الدخول
                  </div>
                )} */}
              </div>

              <button
                type="submit"
                // disabled={isLoading || !hasReadTerms}
                className={`relative w-full rounded-lg p-4 text-sm font-medium text-white transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary/60 
                   bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90
                  bg-gray-400 cursor-not-allowed'
                } ${isLoading ? 'opacity-70' : ''}`}
              >
                {isLoading ? (
                  <svg
                    className="animate-spin h-5 w-5 mx-auto"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  `تسجيل الدخول كـ ${loginType === 'doctor' ? 'المدير' : 'موظف'}`
                )}
              </button>
            </form>

         
          </div>
        </div>
      </div>

      <aside className="relative hidden lg:block lg:w-1/2">
        {/* <img
          alt="Medical Background"
          src="/.jpg"
          className="absolute inset-0 h-full w-full object-cover"
        /> */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary/40 to-blue-500/40" />

        <div className="absolute inset-0 flex items-center justify-center p-12">
          <div className="text-center text-white space-y-4 max-w-xl backdrop-blur-sm bg-black/30 dark:bg-black/50 p-8 rounded-2xl">
            <h2 className="text-3xl font-bold">شركة الفضاء الهندسي </h2>
            <p className="text-gray-100">
             الشركة الاولى في مجال المساحة
            </p>
          </div>
        </div>
      </aside>
    </section>
  );
};

export default Login;