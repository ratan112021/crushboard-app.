import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    addDoc,
    doc, 
    getDoc,
    updateDoc, 
    increment,
    query, 
    orderBy,
    onSnapshot,
    serverTimestamp,
    where,
    writeBatch,
    setDoc
} from 'firebase/firestore';
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "firebase/storage";

// --- Firebase Configuration ---
// Reads configuration from environment variables, making it secure for deployment.
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- Main App Component ---
export default function App() {
    const [page, setPage] = useState('wall');
    const [selectedPostId, setSelectedPostId] = useState(null);
    const [user, setUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // --- Authentication & Profile Effect ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                const userDocRef = doc(db, "users", currentUser.uid);

                const unsubscribeProfile = onSnapshot(userDocRef, async (snapshot) => {
                    if (!snapshot.exists()) {
                        // If user profile doesn't exist, create it.
                        await setDoc(userDocRef, {
                            uid: currentUser.uid,
                            alias_name: 'Newbie',
                            college: 'Unknown University',
                            crush_points: 0,
                            verification_status: 'unverified', // unverified, pending, verified, rejected
                            id_card_url: ''
                        });
                        // The onSnapshot listener will automatically pick up the new document.
                    } else {
                        setUserProfile({ id: snapshot.id, ...snapshot.data() });
                    }
                    setIsAuthReady(true);
                });
                return () => unsubscribeProfile();
            } else {
                try {
                    await signInAnonymously(auth);
                } catch (error) {
                    console.error("Error during sign-in:", error);
                }
                // Don't set auth ready here, wait for a user to be signed in.
            }
        });
        return () => unsubscribe();
    }, []);

    const navigateTo = (pageName, postId = null) => {
        setPage(pageName);
        setSelectedPostId(postId);
    };
    
    if (!isAuthReady || !userProfile) return <LoadingScreen />;

    if (userProfile.verification_status !== 'verified') {
        return <VerificationPage user={user} userProfile={userProfile} />;
    }

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <Header navigateTo={navigateTo} />
            <main className="p-4 sm:p-6">
                {page === 'wall' && <Wall navigateTo={navigateTo} user={user} />}
                {page === 'newPost' && <NewPost navigateTo={navigateTo} user={user} />}
                {page === 'postDetail' && <PostDetail postId={selectedPostId} navigateTo={navigateTo} user={user} />}
            </main>
            <Footer />
        </div>
    );
}

// --- Verification Page ---
const VerificationPage = ({ user, userProfile }) => {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async () => {
        if (!file) {
            setError('Please select your College ID photo.');
            return;
        }
        setUploading(true);
        setError('');

        try {
            const filePath = `id_cards/${user.uid}/${file.name}`;
            const storageRef = ref(storage, filePath);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            const userDocRef = doc(db, `users`, userProfile.id);
            await updateDoc(userDocRef, {
                id_card_url: downloadURL,
                verification_status: 'pending'
            });

            // No need to set local state, onSnapshot will handle it.
        } catch (err) {
            console.error("Verification submission error:", err);
            setError("Something went wrong. Please try again.");
            setUploading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-gray-800 p-8 rounded-xl shadow-lg text-center">
                <h1 className="text-2xl font-bold text-white mb-2">Verification Required</h1>
                <p className="text-gray-400 mb-6">To keep our community authentic, please upload your college ID.</p>

                {userProfile.verification_status === 'unverified' && (
                    <>
                        <div className="mb-4">
                            <label htmlFor="id-upload" className="cursor-pointer bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-full transition duration-300">
                                {file ? 'Change File' : 'Select ID Photo'}
                            </label>
                            <input id="id-upload" type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                        </div>
                        {file && <p className="text-gray-300 mb-4">Selected: {file.name}</p>}
                        
                        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                        <button onClick={handleSubmit} disabled={uploading || !file} className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition duration-300 disabled:bg-gray-700">
                            {uploading ? 'Submitting...' : 'Submit for Approval'}
                        </button>
                    </>
                )}

                {userProfile.verification_status === 'pending' && (
                    <div className="mt-6">
                        <h2 className="text-xl text-yellow-400 font-bold">Approval Pending</h2>
                        <p className="text-gray-300 mt-2">Your ID has been submitted. Our admin will review it shortly. Thanks for your patience!</p>
                    </div>
                )}
                 {userProfile.verification_status === 'rejected' && (
                    <div className="mt-6">
                        <h2 className="text-xl text-red-500 font-bold">Verification Failed</h2>
                        <p className="text-gray-300 mt-2">There was an issue with your submission. Please try again with a clear photo of your ID.</p>
                         <button onClick={() => updateDoc(doc(db, 'users', userProfile.id), { verification_status: 'unverified' })} className="mt-4 bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-full">
                            Try Again
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- UI Components ---
const Header = ({ navigateTo }) => (
    <header className="bg-gray-800 shadow-lg sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
                <div className="text-2xl font-bold text-pink-500 cursor-pointer tracking-wider" onClick={() => navigateTo('wall')}>
                    CrushBoard 🔥
                </div>
                <button onClick={() => navigateTo('newPost')} className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-2 px-4 rounded-full transition duration-300 ease-in-out transform hover:scale-105 shadow-md">
                    New Post
                </button>
            </div>
        </div>
    </header>
);

const Footer = () => (
    <footer className="text-center py-4 text-gray-500 text-sm">
        <p>Built for the chaos of college life.</p>
    </footer>
);

const LoadingScreen = () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
            <div className="animate-pulse text-3xl font-bold text-pink-500 mb-2">CrushBoard</div>
            <p className="text-gray-400">Loading the latest drama...</p>
        </div>
    </div>
);

// --- Page Components ---
const Wall = ({ navigateTo, user }) => {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState('new');
    const [filterTag, setFilterTag] = useState(null);

    const postsCollectionPath = useMemo(() => `posts`, []);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        
        const postsRef = collection(db, postsCollectionPath);
        const filterClauses = filterTag ? [where('primaryTag', '==', filterTag)] : [];
        const sortClauses = sortBy === 'hot' ? [orderBy('score', 'desc')] : [orderBy('timestamp', 'desc')];
        
        const q = query(postsRef, ...filterClauses, ...sortClauses);

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            setPosts(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching posts: ", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, postsCollectionPath, sortBy, filterTag]);

    const primaryTags = ['#Crush', '#Roast', '#Confession', '#Dare', '#Question'];

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-gray-800 p-4 rounded-lg mb-6 shadow-md">
                <div className="flex flex-wrap gap-2 items-center justify-center">
                    <span className="font-bold mr-2">Sort:</span>
                    <button onClick={() => setSortBy('new')} className={`px-3 py-1 text-sm rounded-full ${sortBy === 'new' ? 'bg-pink-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>New</button>
                    <button onClick={() => setSortBy('hot')} className={`px-3 py-1 text-sm rounded-full ${sortBy === 'hot' ? 'bg-pink-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>Hot</button>
                </div>
                <div className="flex flex-wrap gap-2 items-center justify-center mt-4 border-t border-gray-700 pt-4">
                     <span className="font-bold mr-2">Filter:</span>
                    <button onClick={() => setFilterTag(null)} className={`px-3 py-1 text-sm rounded-full ${!filterTag ? 'bg-pink-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>All</button>
                    {primaryTags.map(tag => (
                        <button key={tag} onClick={() => setFilterTag(tag)} className={`px-3 py-1 text-sm rounded-full ${filterTag === tag ? 'bg-pink-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>{tag}</button>
                    ))}
                </div>
            </div>

            {loading ? <p className="text-center mt-8 text-gray-400">Fetching posts...</p> : 
                posts.length === 0 ? (
                    <p className="text-center text-gray-400 bg-gray-800 p-6 rounded-lg shadow">No posts found. Try changing the filter or be the first to post!</p>
                ) : (
                    <div className="space-y-4">
                        {posts.map(post => (
                            <PostCard key={post.id} post={post} user={user} navigateTo={navigateTo} />
                        ))}
                    </div>
                )
            }
        </div>
    );
};

const NewPost = ({ navigateTo, user }) => {
    const [message, setMessage] = useState('');
    const [primaryTag, setPrimaryTag] = useState('#Crush');
    const [optionalTags, setOptionalTags] = useState('');
    const [alias, setAlias] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) { setError('Your message cannot be empty!'); return; }
        if (!user) { setError('You must be signed in to post.'); return; }

        setIsSubmitting(true);
        setError('');

        try {
            const optionalTagsArray = optionalTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0 && tag.startsWith('#'));
            const postsCollectionPath = `posts`;
            await addDoc(collection(db, postsCollectionPath), {
                message: message.trim(), primaryTag, optionalTags: optionalTagsArray,
                alias: alias.trim() || 'Anonymous', upvotes: 0, downvotes: 0, score: 0,
                timestamp: serverTimestamp(), userId: user.uid, replyCount: 0,
            });
            navigateTo('wall');
        } catch (err) {
            console.error("Error creating post:", err);
            setError('Failed to create post. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-lg mx-auto bg-gray-800 p-8 rounded-xl shadow-lg">
            <h1 className="text-2xl font-bold mb-6 text-center text-white">Create a New Post</h1>
            <form onSubmit={handleSubmit} className="space-y-6">
                 <div>
                    <label htmlFor="primaryTag" className="block text-sm font-medium text-gray-300 mb-1">Primary Tag (Required)</label>
                    <select id="primaryTag" value={primaryTag} onChange={(e) => setPrimaryTag(e.target.value)} className="w-full p-3 border border-gray-600 rounded-lg bg-gray-700 text-white focus:ring-pink-500 focus:border-pink-500">
                        <option>#Crush</option><option>#Roast</option><option>#Confession</option><option>#Dare</option><option>#Question</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-1">Your Message</label>
                    <textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} rows="4" className="w-full p-3 border border-gray-600 rounded-lg bg-gray-700 text-white focus:ring-pink-500 focus:border-pink-500" placeholder="Spill the tea..." required></textarea>
                </div>
                <div>
                    <label htmlFor="optionalTags" className="block text-sm font-medium text-gray-300 mb-1">Optional Tags</label>
                    <input id="optionalTags" type="text" value={optionalTags} onChange={(e) => setOptionalTags(e.target.value)} className="w-full p-3 border border-gray-600 rounded-lg bg-gray-700 text-white focus:ring-pink-500 focus:border-pink-500" placeholder="e.g., #ProfessorX, #HostelLife"/>
                </div>
                <div>
                    <label htmlFor="alias" className="block text-sm font-medium text-gray-300 mb-1">Alias (Optional)</label>
                    <input id="alias" type="text" value={alias} onChange={(e) => setAlias(e.target.value)} className="w-full p-3 border border-gray-600 rounded-lg bg-gray-700 text-white focus:ring-pink-500 focus:border-pink-500" placeholder="Your secret identity"/>
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <div>
                    <button type="submit" disabled={isSubmitting} className="w-full bg-pink-600 hover:bg-pink-700 text-white font-bold py-3 px-4 rounded-lg transition duration-300 disabled:bg-pink-800">
                        {isSubmitting ? 'Posting...' : 'Post Anonymously'}
                    </button>
                </div>
            </form>
        </div>
    );
};

const PostDetail = ({ postId, navigateTo, user }) => {
    const [post, setPost] = useState(null);
    const [replies, setReplies] = useState([]);
    const [loading, setLoading] = useState(true);

    const postDocPath = useMemo(() => `posts/${postId}`, [postId]);
    const repliesCollectionPath = useMemo(() => `replies`, []);

    useEffect(() => {
        if (!postId || !user) return;
        setLoading(true);
        
        const unsubscribePost = onSnapshot(doc(db, postDocPath), (doc) => {
            if (doc.exists()) setPost({ id: doc.id, ...doc.data() });
            else console.error("Post not found");
            setLoading(false);
        });

        const q = query(collection(db, repliesCollectionPath), where("postId", "==", postId), orderBy("timestamp", "asc"));
        const unsubscribeReplies = onSnapshot(q, (snapshot) => {
            setReplies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => { unsubscribePost(); unsubscribeReplies(); };
    }, [postId, user, postDocPath, repliesCollectionPath]);

    if (loading) return <p className="text-center mt-8 text-gray-400">Loading post...</p>;
    if (!post) return <div className="text-center mt-8"><p className="text-red-400">Post not found.</p><button onClick={() => navigateTo('wall')} className="mt-4 text-pink-500 hover:underline">Back to Wall</button></div>;

    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigateTo('wall')} className="mb-4 text-pink-500 hover:underline">&larr; Back to Wall</button>
            <div className="bg-gray-800 p-1 rounded-lg shadow-lg">
                <PostCard post={post} user={user} navigateTo={navigateTo} isDetailView={true} />
            </div>
            <div className="mt-8">
                <h2 className="text-xl font-bold mb-4 text-white">Replies ({replies.length})</h2>
                <ReplyForm postId={postId} user={user} />
                <div className="space-y-4 mt-6">
                    {replies.map(reply => <ReplyCard key={reply.id} reply={reply} />)}
                </div>
            </div>
        </div>
    );
};

// --- Card & Interaction Components ---
const PostCard = ({ post, user, navigateTo, isDetailView = false }) => {
    const [voteStatus, setVoteStatus] = useState(null);
    const voteDocRef = useMemo(() => {
        if (!user) return null;
        return doc(db, `votes/${user.uid}_${post.id}`);
    }, [user, post.id]);

    useEffect(() => {
        if (!voteDocRef) return;
        getDoc(voteDocRef).then(docSnap => {
            if (docSnap.exists()) setVoteStatus(docSnap.data().voteType);
        });
    }, [voteDocRef]);

    const handleVote = async (newVoteType) => {
        if (!user || !voteDocRef) return;
        const postRef = doc(db, `posts/${post.id}`);
        const batch = writeBatch(db);
        const currentVote = voteStatus;
        let upvoteChange = 0, downvoteChange = 0;

        if (currentVote === newVoteType) {
            if (newVoteType === 'up') upvoteChange = -1; else downvoteChange = -1;
            batch.delete(voteDocRef);
            setVoteStatus(null);
        } else {
            if (currentVote === 'up') upvoteChange = -1;
            if (currentVote === 'down') downvoteChange = -1;
            if (newVoteType === 'up') upvoteChange += 1;
            if (newVoteType === 'down') downvoteChange += 1;
            batch.set(voteDocRef, { userId: user.uid, postId: post.id, voteType: newVoteType });
            setVoteStatus(newVoteType);
        }
        
        batch.update(postRef, {
            upvotes: increment(upvoteChange),
            downvotes: increment(downvoteChange),
            score: increment(upvoteChange - downvoteChange)
        });
        await batch.commit();
    };

    const score = post.upvotes - post.downvotes;

    return (
        <div className={`bg-gray-800 rounded-lg shadow-md transition-shadow duration-300 flex ${!isDetailView && 'hover:bg-gray-700'}`}>
            <div className="flex flex-col items-center p-3 bg-gray-900/50 rounded-l-lg">
                <button onClick={() => handleVote('up')} className={`p-1 rounded-full ${voteStatus === 'up' ? 'text-pink-500' : 'text-gray-400 hover:bg-gray-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                </button>
                <span className={`font-bold text-lg ${score > 0 ? 'text-pink-500' : score < 0 ? 'text-blue-500' : 'text-gray-400'}`}>{score}</span>
                <button onClick={() => handleVote('down')} className={`p-1 rounded-full ${voteStatus === 'down' ? 'text-blue-500' : 'text-gray-400 hover:bg-gray-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
            </div>
            <div className="p-4 flex-grow" onClick={() => !isDetailView && navigateTo('postDetail', post.id)} style={{ cursor: isDetailView ? 'default' : 'pointer' }}>
                <div className="flex justify-between items-start mb-2">
                    <div>
                        <span className="font-bold text-pink-400 mr-2">{post.primaryTag}</span>
                        <span className="text-sm font-semibold text-gray-200">{post.alias}</span>
                    </div>
                    <span className="text-xs text-gray-500">{post.timestamp ? new Date(post.timestamp.seconds * 1000).toLocaleString() : 'Just now'}</span>
                </div>
                <p className="text-gray-300 my-3 text-lg">{post.message}</p>
                {post.optionalTags && post.optionalTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                        {post.optionalTags.map(tag => <span key={tag} className="text-xs bg-gray-700 px-2 py-1 rounded-full">{tag}</span>)}
                    </div>
                )}
                <div className="flex items-center text-gray-400 text-sm">
                    <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm1.5 0a.5.5 0 00-.5.5v6a.5.5 0 00.5.5h11a.5.5 0 00.5-.5V5.5a.5.5 0 00-.5-.5h-11zM5 7a1 1 0 00-1 1v1a1 1 0 001 1h1a1 1 0 001-1V8a1 1 0 00-1-1H5z"></path></svg>
                    <span>{post.replyCount || 0} Replies</span>
                </div>
            </div>
        </div>
    );
};

const ReplyCard = ({ reply }) => (
    <div className="bg-gray-700 p-4 rounded-lg">
        <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-gray-200">{reply.alias || 'Anonymous'}</span>
            <span className="text-xs text-gray-500">{reply.timestamp ? new Date(reply.timestamp.seconds * 1000).toLocaleString() : 'Just now'}</span>
        </div>
        <p className="text-gray-300">{reply.reply_text}</p>
    </div>
);

const ReplyForm = ({ postId, user }) => {
    const [replyText, setReplyText] = useState('');
    const [alias, setAlias] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleReplySubmit = async (e) => {
        e.preventDefault();
        if (!replyText.trim() || !user) return;
        setIsSubmitting(true);
        try {
            const batch = writeBatch(db);
            const replyRef = doc(collection(db, `replies`));
            batch.set(replyRef, {
                reply_text: replyText.trim(), postId: postId, userId: user.uid,
                alias: alias.trim() || 'Anonymous', timestamp: serverTimestamp(),
            });

            const postRef = doc(db, `posts/${postId}`);
            batch.update(postRef, { replyCount: increment(1) });
            
            await batch.commit();
            setReplyText(''); setAlias('');
        } catch (error) {
            console.error("Error submitting reply:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleReplySubmit} className="bg-gray-800 p-4 rounded-lg shadow-sm space-y-3">
            <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows="2" className="w-full p-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:ring-pink-500 focus:border-pink-500" placeholder="Write a reply..." required></textarea>
            <div className="flex flex-col sm:flex-row gap-3">
                 <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)} className="flex-grow p-2 border border-gray-600 rounded-md bg-gray-700 text-white focus:ring-pink-500 focus:border-pink-500" placeholder="Alias (Optional)"/>
                <button type="submit" disabled={isSubmitting || !replyText.trim()} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition duration-300 disabled:bg-gray-700">
                    {isSubmitting ? 'Replying...' : 'Reply'}
                </button>
            </div>
        </form>
    );
};
