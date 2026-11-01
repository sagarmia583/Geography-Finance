import { toast } from "sonner";

/**
 * ভূগোল ও পরিবেশ বিভাগ — ভাউচার সিস্টেম
 * কেন্দ্রীভূত নোটিফিকেশন ও রিটার্ন ফিডব্যাক মেসেজ সার্ভিস
 */

export const notifyFeedback = {
  /**
   * ১. নতুন ভাউচার সংরক্ষণ (New Save)
   */
  newSave: (voucherId: string, examTitle?: string, toastId: string = "save-voucher") => {
    toast.dismiss(toastId);
    toast.success("নতুন ভাউচার সংরক্ষিত হয়েছে! 🎉", {
      id: toastId,
      description: `${examTitle ? `"${examTitle}" ` : ""}(আইডি: ${voucherId}) সফলভাবে গুগল শীটে নতুন ভাউচার হিসেবে জমা হয়েছে।`,
      duration: 5000,
    });
  },

  /**
   * ২. ভাউচার বা ডাটাবেস আপডেট (Update)
   */
  update: (voucherId: string, examTitle?: string, toastId: string = "save-voucher") => {
    toast.dismiss(toastId);
    toast.success("ভাউচার আপডেট সম্পন্ন হয়েছে! ✅", {
      id: toastId,
      description: `${examTitle ? `"${examTitle}" ` : ""}(আইডি: ${voucherId})-এর সর্বশেষ পরিবর্তনগুলো গুগল শীটে সফলভাবে আপডেট হয়েছে।`,
      duration: 4500,
    });
  },

  /**
   * ৩. ভাউচার খোলা / লোড করা (Open)
   */
  open: (voucherId: string, examTitle?: string) => {
    toast.info("ভাউচার খোলা হয়েছে 📂", {
      id: `open-${voucherId}`,
      description: `${examTitle ? `"${examTitle}" ` : ""}(আইডি: ${voucherId}) সম্পাদনার জন্য সফলভাবে লোড করা হয়েছে।`,
      duration: 4000,
    });
  },

  /**
   * ৪. ভাউচার বা উইন্ডো বন্ধ করা (Close)
   */
  close: (message?: string) => {
    toast.info("ভাউচার বন্ধ করা হয়েছে ↩️", {
      id: "close-feedback",
      description: message || "প্রধান ভাউচার তালিকায় ফিরে আসা হয়েছে।",
      duration: 3000,
    });
  },

  /**
   * ৫. নতুন খালি ফরম প্রস্তুত (New Draft / Reset)
   */
  newDraft: (title?: string) => {
    toast.success("নতুন খালি ভাউচার প্রস্তুত! ✨", {
      id: "draft-feedback",
      description: title
        ? `${title}-এর জন্য নতুন ভাউচার ফরম প্রস্তুত করা হয়েছে।`
        : "নতুন তথ্য ইনপুট দেওয়ার জন্য খালি ভাউচার ফরম প্রস্তুত।",
      duration: 3500,
    });
  },

  /**
   * ৬. ভাউচার ডিলিট (Delete)
   */
  delete: (voucherId: string, examTitle?: string, toastId: string = "delete-voucher") => {
    toast.dismiss(toastId);
    toast.success("ভাউচার মুছে ফেলা হয়েছে 🗑️", {
      id: toastId,
      description: `${examTitle ? `"${examTitle}" ` : ""}(আইডি: ${voucherId}) গুগল শীট থেকে স্থায়ীভাবে মুছে ফেলা হয়েছে।`,
      duration: 4500,
    });
  },

  /**
   * ৭. ডাটাবেস আপডেট / সিঙ্ক সফল (DB Sync Success)
   */
  dbSyncSuccess: (details?: string) => {
    toast.dismiss("sync-db");
    toast.success("ডাটাবেস সফলভাবে আপডেট হয়েছে! 🔄", {
      id: "sync-db",
      description: details || "গুগল শীট থেকে শিক্ষক তালিকা, হারের বিবরণী ও খাতসমূহ সফলভাবে আপডেট হয়েছে।",
      duration: 4000,
    });
  },

  /**
   * ৮. লোডিং প্রগ্রেস মেসেজ (Action in Progress)
   */
  loading: (message: string, id: string = "action-loading") => {
    return toast.loading(message, { id });
  },

  /**
   * ৯. সাধারণ তথ্য / অ্যাকশন নিশ্চিতকরণ (Info)
   */
  info: (title: string, description?: string, id?: string) => {
    if (id) toast.dismiss(id);
    const opts: { description?: string; id?: string; duration?: number } = { duration: 3500 };
    if (description !== undefined) opts.description = description;
    if (id !== undefined) opts.id = id;
    toast.info(title, opts);
  },

  /**
   * ১০. সফল বার্তা (Success)
   */
  success: (title: string, description?: string, id?: string) => {
    if (id) toast.dismiss(id);
    const opts: { description?: string; id?: string; duration?: number } = { duration: 3500 };
    if (description !== undefined) opts.description = description;
    if (id !== undefined) opts.id = id;
    toast.success(title, opts);
  },

  /**
   * ১১. ত্রুটি বার্তা (Error)
   */
  error: (title: string, description?: string, id?: string) => {
    if (id) toast.dismiss(id);
    const opts: { description?: string; id?: string; duration?: number } = { duration: 6000 };
    if (description !== undefined) opts.description = description;
    if (id !== undefined) opts.id = id;
    toast.error(title, opts);
  },

  /**
   * ১২. যে কোনো টোস্ট বন্ধ করা (Dismiss)
   */
  dismiss: (id?: string) => {
    toast.dismiss(id);
  },
};
