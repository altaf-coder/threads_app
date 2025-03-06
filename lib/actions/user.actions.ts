"use server";

import { revalidatePath } from "next/cache";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";
import Thread from "../models/thread.model";
import { FilterQuery, model, SortOrder } from "mongoose";
import path from "path";
interface Params {
  userId: string;
  username: string;
  name: string;
  bio: string;
  image: string;
  path: string;
}
export async function updateUser({
  userId,
  username,
  name,
  bio,
  image,
  path,
}: Params): Promise<void> {
  await connectToDB();
  try {
    await User.findOneAndUpdate(
      { id: userId },
      { username: username.toLowerCase(), name, bio, image, onboarded: true },
      { upsert: true }
    );
    if (path === "/profile/edit") {
      revalidatePath(path);
    }
  } catch (error: any) {
    throw new Error(`Failed to create/update user: ${error}`);
  }
}

// FETCH USER ACTION
export async function fetchUser(userId: string) {
  try {
    connectToDB();
    return await User.findOne({ id: userId });
    // .populate({
    //   path: "communities",
    //   model: Community,
    // });
  } catch (error: any) {
    throw new Error(`Failed to fetch user ${error.message}`);
  }
}

// FETCH USER POSTS/THREADS

export async function fetchUserPosts(userId: string) {
  await connectToDB(); // Ensure the database connection is awaited if it's async
  try {
    // Find all threads authored by user with userId
    // Populate community
    const threads = await User.findOne({ id: userId }) // Use _id instead of id
      .populate({
        path: "threads", // Ensure this matches your schema field
        model: Thread,
        populate: {
          path: "children",
          model: Thread,
          populate: {
            path: "author",
            model: User,
            select: "name image id",
          },
        },
      });

    return threads;
  } catch (error: any) {
    throw new Error(`Failed to fetch user posts: ${error.message}`);
  }
}

// FETCH USERS

export async function fetchUsers({
  userId,
  searchTerm = "",
  pageNumber,
  pageSize,
  sortBy = "desc",
}: {
  userId: string;
  searchTerm?: string;
  pageNumber: number;
  pageSize: number;
  sortBy: SortOrder;
}) {
  try {
    connectToDB();
    const skipAmmount = (pageNumber - 1) * pageSize;
    const regex = new RegExp(searchTerm, "i"); // 'i' flag for case-insensitive search
    const query: FilterQuery<typeof User> = {
      id: { $ne: userId },
    };
    if (searchTerm.trim() !== "") {
      query.$or = [
        { username: { $regex: regex } },
        { name: { $regex: regex } },
      ];
    }
    const sortOptions = { createdAt: sortBy };
    const usersQuery = User.find(query)
      .sort(sortOptions)
      .skip(skipAmmount)
      .limit(pageSize);
    const totalUsersCount = await User.countDocuments(query);
    const users = await usersQuery.exec();
    const isNext = totalUsersCount > skipAmmount + users.length;
    return { users, isNext };
  } catch (error: any) {
    throw new Error(`Failed to fecth users: ${error.message}`);
  }
}

// FETCH USER notifications

export async function getActivity(userId: string) {
  try {
    connectToDB();
    // fetch all threads by user

    const userThreads = await Thread.find({ author: userId });
    // collect all threads childs (replies)
    const childThreadIds = userThreads.reduce((acc, userThread) => {
      return acc.concat(userThread.children);
    }, []);
    const replies = await Thread.find({
      _id: { $in: childThreadIds },
      author: { $ne: userId },
    }).populate({
      path: "author",
      model: User,
      select: "name image id",
    });
    return replies;
  } catch (error: any) {
    throw new Error(`Failed to fetch activity: ${error.message}`);
  }
}
