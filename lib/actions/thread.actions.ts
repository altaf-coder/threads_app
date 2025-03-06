"use server";
import { revalidatePath } from "next/cache";
import Thread from "../models/thread.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";
import { create } from "domain";
import { text } from "stream/consumers";

interface Params {
  text: string;
  author: string;
  communityId: string | null;
  path: string;
}
export async function createThread({
  text,
  author,
  communityId,
  path,
}: Params) {
  try {
    connectToDB();
    const createdThread = await Thread.create({
      text,
      author,
      community: null,
    });
    //   UPDATE USER MODEL
    await User.findByIdAndUpdate(author, {
      $push: { threads: createdThread._id },
    });
    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Failed to create thread: ${error.message}`);
  }
}

// FETCH POSTS

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  connectToDB();
  // CALCULATE PAGE TO SKIP
  const skipAmmount = (pageNumber - 1) * pageSize;
  const postQuery = await Thread.find({
    parentId: { $in: [null, undefined] },
  })
    .sort({ createdAt: "desc" })
    .skip(skipAmmount)
    .limit(pageSize)
    .populate({ path: "author", model: User })
    .populate({
      path: "children",
      populate: {
        path: "author",
        model: User,
        select: "name image _id, parentId",
      },
    });
  const totalPostsCount = await Thread.countDocuments({
    parentId: { $in: [null, undefined] },
  });
  const posts = await postQuery;
  const isNext = totalPostsCount > skipAmmount + posts.length;
  return { posts, isNext };
}

// FETCH THREADBYID

export async function fetchThreadById(id: string) {
  connectToDB();
  try {
    // TODO: POPULATE COMMUNITY
    const thread = await Thread.findById(id)
      .populate({
        path: "author",
        model: User,
        select: "name image _id id",
      })
      .populate({
        path: "children",
        populate: [
          {
            path: "author",
            model: User,
            select: "name image _id, parentId",
          },
          {
            path: "children",
            model: Thread,
            populate: {
              path: "author",
              model: User,
              select: "name image, id _id, parentId",
            },
          },
        ],
      })
      .exec();
    return thread;
  } catch (error: any) {
    throw new Error(`Failed to Fetch Thread: ${error.message}`);
  }
}

// ADD COMMENT TO THREAD
export async function addCommentToThread(
  threadId: string,
  commentText: string,
  userId: string,
  path: string
) {
  connectToDB();
  try {
    //adding a comment
    // FIND ORIGINIOL THREAD
    const originalThread = await Thread.findById(threadId);
    if (!originalThread) {
      throw new Error("Thread not found");
    }
    // NEW THREAD WITH COMMENT
    const commentThread = new Thread({
      text: commentText,
      author: userId,
      parentId: threadId,
    });
    const savedCommentThread = await commentThread.save();
    // UPDATE ORIGINAL THREAD TO INCLUDE COMMENT
    originalThread.children.push(savedCommentThread._id);
    // SAVE ORIGINAL THREAD
    await originalThread.save();
    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Failed to add comments${error.message}`);
  }
}
