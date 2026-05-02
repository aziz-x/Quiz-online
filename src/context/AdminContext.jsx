import { createContext, useEffect, useState } from "react";
import { toast } from "react-toastify";
import axios from "axios";

export const AdminContext = createContext();

const AdminContextProvider = (props) => {
  // استخدام توكن موحد بدلاً من aToken
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [id_doctor, setid_doctor] = useState(localStorage.getItem("id_doctor") || "");
  const [id, setid] = useState(localStorage.getItem("id") || "");
  const [loginType, setloginType] = useState(localStorage.getItem("loginType") || "");
  
  const [doctors, setDoctors] = useState([]);
  const [NameDoctor, setName] = useState("");
  const [sp, setsp] = useState("");
  const [dashData, setDashData] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [permissions, setPermissions] = useState({});

  const backendUrl = "https://https://backend.quiz";

  // إعداد axios لاستخدام التوكن الموحد
  const axiosConfig = {
    headers: { 
      Authorization: `Bearer ${token}`,
      token: token // للتوافق مع النظام السابق
    }
  };

  // دالة لتنظيف البيانات وإرسال المستخدم للتسجيل
  const handleTokenExpiration = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("id_doctor");
    localStorage.removeItem("id");
    localStorage.removeItem("loginType");
    setToken("");
    setid_doctor("");
    setid("");
    setloginType("");
    setPermissions({});
    setAccounts([]);
    setDoctors([]);
    setDashData(false);
    setName("");
    
    // إرسال المستخدم لصفحة التسجيل
    window.location.href = "/login";
  };

  // دالة للتحقق من صحة التوكن
  const validateToken = async () => {
    if (!token) {
      return false;
    }

    try {
      const { data } = await axios.post(
        `${backendUrl}/api/validate-token`,
        {},
        axiosConfig
      );
      return data.success;
    } catch (error) {
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        return false;
      }
      // في حالة خطأ الشبكة، لا نعتبر التوكن غير صالح
      return true;
    }
  };

  // دالة مُحدثة للتعامل مع الأخطاء في الطلبات
  const handleApiError = (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      toast.error("انتهت صلاحية الجلسة. سيتم إعادة توجيهك لتسجيل الدخول");
      handleTokenExpiration();
      return true; // تم التعامل مع الخطأ
    }
    return false; // لم يتم التعامل مع الخطأ
  };

  const getAllDoctors = async () => {
    try {
      const { data } = await axios.post(
        `${backendUrl}/api`,
        {},
        axiosConfig
      );
      if (data.success) {
        setDoctors(data.doctors);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      if (!handleApiError(error)) {
        toast.error(error.message);
      }
    }
  };

  const fetchAccounts = async () => {
    try {
      const { data } = await axios.get(
        `${backendUrl}/api/doctor/${id_doctor}/accounts`,
        axiosConfig
      );
      if (data.success) {
        setAccounts(data.accounts);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      if (!handleApiError(error)) {
        toast.error(error.message);
      }
    }
  };

  const changeAvailability = async (docId) => {
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/admin/change-availability`,
        { docId },
        axiosConfig
      );
      if (data.success) {
        toast.success(data.message);
        getAllDoctors();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      if (!handleApiError(error)) {
        toast.error(error.message);
      }
    }
  };

  const getDoctorAccounts = async (doctorId) => {
    try {
      const { data } = await axios.get(
        `${backendUrl}/api/doctor/${doctorId}/accounts`,
        axiosConfig
      );
      if (data.success) {
        setAccounts(data.accounts);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      if (!handleApiError(error)) {
        toast.error(error.message);
      }
    }
  };

  const cancelAppointment = async (appointmentId) => {
    try {
      const { data } = await axios.post(
        `${backendUrl}/api/admin/cancel-appointment`,
        { appointmentId },
        axiosConfig
      );
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      if (!handleApiError(error)) {
        toast.error(error.message);
      }
    }
  };

  const getDashData = async () => {
    try {
      const { data } = await axios.get(
        `${backendUrl}/api/admin/dashboard`,
        axiosConfig
      );
      if (data.success) {
        setDashData(data.dashData);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      if (!handleApiError(error)) {
        toast.error(error.message);
      }
    }
  };

  const fetchPermissions = async () => {
    try {
      if (loginType === "doctor") {
        const { data } = await axios.get(
          `${backendUrl}/api/doctor/profile/${id_doctor}`,
          axiosConfig
        );
        if (data.success && data.profileData) {
          setPermissions(data.profileData.permissions);
          setName(data.profileData.name);
          setsp(data.profileData.speciality)
        } else {
          toast.error(data.message || "Error fetching doctor permissions");
        }
      } else if (loginType === "employee") {
        const { data } = await axios.get(
          `${backendUrl}/api/employee/em/${id}`,
          axiosConfig
        );
        if (data) {
          setPermissions(data.permissions);
        } else {
          toast.error(data.message || "Error fetching employee permissions");
        }
      }
    } catch (error) {
      if (!handleApiError(error)) {
        toast.error(error.message);
      }
    }
  };

  // التحقق من صحة التوكن عند تحميل التطبيق
  useEffect(() => {
    const checkToken = async () => {
      if (token) {
        const isValid = await validateToken();
        if (!isValid) {
          toast.error("انتهت صلاحية الجلسة. سيتم إعادة توجيهك لتسجيل الدخول");
          handleTokenExpiration();
        }
      }
    };

    checkToken();
  }, []);

  useEffect(() => {
    if (token && loginType) {
      fetchPermissions();
    }
  }, [token, loginType, id_doctor, id]);

  const value = {
    token,
    setToken: (newToken) => {
      localStorage.setItem("token", newToken);
      setToken(newToken);
    },
    // الحفاظ على aToken للتوافق مع النظام السابق
    aToken: token,
    setAToken: (newToken) => {
      localStorage.setItem("token", newToken);
      setToken(newToken);
    },
    id_doctor,
    setid_doctor: (docId) => {
      localStorage.setItem("id_doctor", docId);
      setid_doctor(docId);
    },
    backendUrl,
    id,
    setid: (userId) => {
      localStorage.setItem("id", userId);
      setid(userId);
    },
    loginType,
    setloginType: (type) => {
      localStorage.setItem("loginType", type);
      setloginType(type);
    },
    doctors,
    accounts,
    axiosConfig,
    NameDoctor,
    setAccounts,
    fetchAccounts,
    sp,
    getAllDoctors,
    changeAvailability,
    cancelAppointment,
    dashData,
    getDashData,
    getDoctorAccounts,
    permissions,
    fetchPermissions,
    // إضافة دوال جديدة للتحكم في التوكن
    handleTokenExpiration,
    validateToken,
  };

  return (
    <AdminContext.Provider value={value}>
      {props.children}
    </AdminContext.Provider>
  );
};

export default AdminContextProvider;