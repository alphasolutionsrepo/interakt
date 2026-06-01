import { motion } from "framer-motion";
import Link from "next/link";

import { MessageIcon } from "./icons";

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-[500px] mx-4 md:mx-0"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="border rounded-lg p-6 flex flex-col gap-4 text-zinc-500 text-sm dark:text-zinc-400 dark:border-zinc-700">
        <p className="flex flex-row justify-center gap-4 items-center text-zinc-900 dark:text-zinc-50">
          <MessageIcon />
        </p>
        <h1>Build a Tech Stack That Works for Your Business.</h1>
        <p>
          We craft customized, advanced technology solutions to help you scale, streamline, and grow—no matter which platform you’re using.</p>
        <p>
          Just like this one; to create a seamless chat experience.
        </p>
        <p>
          {" "}
          You can learn more about the us by visiting our{" "}
          <Link
            className="text-blue-500 dark:text-blue-400"
            href="/docs"
            target="_blank"
          >
            website
          </Link>
          .
        </p>
      </div>
    </motion.div>
  );
};
